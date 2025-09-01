import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { db, isGroupChat } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { Message, messageValidator } from '@/lib/validations/message'
import { User } from '@/types/db'
import { nanoid } from 'nanoid'
import { getServerSession } from 'next-auth'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const { text, chatId } = (await req.json()) as { text: string; chatId: string }
    if (!text || !chatId) return new Response('Invalid body', { status: 400 })

    const timestamp = Date.now()

    // GROUP CHAT
    if (isGroupChat(chatId)) {
      const groupId = chatId.replace('group:', '')

      // Validate that the user is a member of the group
      const members = (await fetchRedis('smembers', `group:${groupId}:members`)) as string[] | null
      if (!members || !members.includes(session.user.id)) {
        return new Response('Unauthorized', { status: 401 })
      }

      const messageData: Message = {
        id: nanoid(),
        senderId: session.user.id,
        text,
        timestamp,
      }
      const message = messageValidator.parse(messageData)

      // Persist
      await db.zadd(`group:${groupId}:messages`, {
        score: timestamp,
        member: JSON.stringify(message),
      })

      // Realtime for group
      await pusherServer.trigger(toPusherKey(`group:${groupId}`), 'incoming_message', message)

      return new Response('OK')
    }

    // 1-1 CHAT
    const [userId1, userId2] = chatId.split('--')
    if (session.user.id !== userId1 && session.user.id !== userId2) {
      return new Response('Unauthorized', { status: 401 })
    }

    const friendId = session.user.id === userId1 ? userId2 : userId1

    // Ensure friendship
    const friendList = (await fetchRedis('smembers', `user:${session.user.id}:friends`)) as string[] | null
    const isFriend = !!friendList?.includes(friendId)
    if (!isFriend) {
      return new Response('Unauthorized', { status: 401 })
    }

    const messageData: Message = {
      id: nanoid(),
      senderId: session.user.id,
      text,
      timestamp,
    }
    const message = messageValidator.parse(messageData)

    // Realtime to the chat room
    await pusherServer.trigger(toPusherKey(`chat:${chatId}`), 'incoming-message', message)

    // Notify chat list of friend
    const rawSender = (await fetchRedis('get', `user:${session.user.id}`)) as string
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

    return new Response('OK')
  } catch (error) {
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 })
    }
    return new Response('Internal Server Error', { status: 500 })
  }
}
