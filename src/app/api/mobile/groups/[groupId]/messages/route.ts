import { getBearerUserId } from '@/lib/mobile-jwt'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { nanoid } from 'nanoid'
import { messageArrayValidator, messageValidator, type Message } from '@/lib/validations/message'

async function ensureMember(userId: string, groupId: string) {
  const members = (await fetchRedis('smembers', `group:${groupId}:members`)) as string[] | null
  if (!members || !members.includes(userId)) {
    throw new Error('Unauthorized')
  }
}

export async function GET(req: Request, { params }: { params: { groupId: string } }) {
  try {
    const userId = getBearerUserId(req)
    const { groupId } = params
    if (!groupId) return new Response('Invalid groupId', { status: 400 })

    await ensureMember(userId, groupId)

    const raw = (await fetchRedis('zrange', `group:${groupId}:messages`, 0, -1)) as string[] | null
    const parsed = (raw ?? [])
      .map((s) => {
        try {
          return JSON.parse(s) as Message
        } catch {
          return null
        }
      })
      .filter(Boolean) as Message[]

    const messages = messageArrayValidator.parse(parsed)

    return new Response(JSON.stringify({ messages }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal Server Error'
    const code =
      msg === 'Missing Bearer token' ||
      msg === 'Invalid token signature' ||
      msg === 'Token expired' ||
      msg === 'Unauthorized'
        ? 401
        : 500
    return new Response(msg, { status: code })
  }
}

export async function POST(req: Request, { params }: { params: { groupId: string } }) {
  try {
    const userId = getBearerUserId(req)
    const { groupId } = params
    if (!groupId) return new Response('Invalid groupId', { status: 400 })

    await ensureMember(userId, groupId)

    const body = await req.json().catch(() => ({}))
    const rawText = typeof body?.text === 'string' ? body.text : ''
    const text = rawText?.trim?.() ?? ''
    const image = typeof body?.image === 'string' ? body.image : undefined
    if (!text && !image) return new Response('Text or image required', { status: 400 })

    const timestamp = Date.now()
    const messageData: Message = {
      id: nanoid(),
      senderId: userId,
      text: text || '',
      image,
      timestamp,
    }
    const message = messageValidator.parse(messageData)

    // persist
    await db.zadd(`group:${groupId}:messages`, {
      score: timestamp,
      member: JSON.stringify(message),
    })

    // realtime
    await pusherServer.trigger(toPusherKey(`group:${groupId}`), 'incoming_message', message)

    return new Response(JSON.stringify({ success: true, message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal Server Error'
    const code =
      msg === 'Missing Bearer token' ||
      msg === 'Invalid token signature' ||
      msg === 'Token expired' ||
      msg === 'Unauthorized'
        ? 401
        : 500
    return new Response(msg, { status: code })
  }
}