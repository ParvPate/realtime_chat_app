import { getBearerUserId } from '@/lib/mobile-jwt'
import { fetchRedis } from '@/helpers/redis'
import { messageArrayValidator, messageValidator, type Message } from '@/lib/validations/message'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { nanoid } from 'nanoid'
import type { User } from '@/types/db'

function isParticipant(userId: string, chatId: string) {
  const [a, b] = chatId.split('--')
  return userId === a || userId === b
}

export async function GET(req: Request, { params }: { params: { chatId: string } }) {
  try {
    const userId = getBearerUserId(req)
    const { chatId } = params

    if (!chatId || !chatId.includes('--')) {
      return new Response('Invalid chatId', { status: 400 })
    }
    if (!isParticipant(userId, chatId)) {
      return new Response('Unauthorized', { status: 401 })
    }

    const results = (await fetchRedis('zrange', `chat:${chatId}:messages`, 0, -1)) as string[] | null
    const dbMessages = (results ?? [])
      .map((m) => {
        try {
          return JSON.parse(m) as Message
        } catch {
          return null
        }
      })
      .filter(Boolean) as Message[]

    const messages = messageArrayValidator.parse(dbMessages)

    return new Response(JSON.stringify({ messages }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal Server Error'
    const code =
      msg === 'Missing Bearer token' ||
      msg === 'Invalid token signature' ||
      msg === 'Token expired'
        ? 401
        : 500
    return new Response(msg, { status: code })
  }
}

export async function POST(req: Request, { params }: { params: { chatId: string } }) {
  try {
    const userId = getBearerUserId(req)
    const { chatId } = params

    if (!chatId || !chatId.includes('--')) {
      return new Response('Invalid chatId', { status: 400 })
    }
    if (!isParticipant(userId, chatId)) {
      return new Response('Unauthorized', { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    if (!text) return new Response('Text required', { status: 400 })

    // Validate friendship
    const [userId1, userId2] = chatId.split('--')
    const friendId = userId === userId1 ? userId2 : userId1

    const friendList = (await fetchRedis('smembers', `user:${userId}:friends`)) as string[] | null
    const isFriend = !!friendList?.includes(friendId)
    if (!isFriend) {
      return new Response('Unauthorized', { status: 401 })
    }

    const timestamp = Date.now()
    const messageData: Message = {
      id: nanoid(),
      senderId: userId,
      text,
      timestamp,
    }
    const message = messageValidator.parse(messageData)

    // Realtime to the chat room
    await pusherServer.trigger(toPusherKey(`chat:${chatId}`), 'incoming-message', message)

    // Notify chat list of friend
    const rawSender = (await fetchRedis('get', `user:${userId}`)) as string
    const sender = JSON.parse(rawSender) as User
    await pusherServer.trigger(toPusherKey(`user:${friendId}:chats`), 'new_message', {
      ...message,
      senderImg: sender.image,
      senderName: sender.name,
    })

    // Persist
    await db.zadd(`chat:${chatId}:messages`, {
      score: timestamp,
      member: JSON.stringify(message),
    })

    return new Response(JSON.stringify({ success: true, message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal Server Error'
    const code =
      msg === 'Missing Bearer token' ||
      msg === 'Invalid token signature' ||
      msg === 'Token expired'
        ? 401
        : 500
    return new Response(msg, { status: code })
  }
}