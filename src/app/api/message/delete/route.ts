import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db, isGroupChat } from '@/lib/db'
import { fetchRedis } from '@/helpers/redis'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import type { Message } from '@/lib/validations/message'

type DeleteBody = {
  chatId: string
  messageId: string
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const { chatId, messageId }: DeleteBody = await req.json()
    if (!chatId || !messageId) return new Response('Invalid body', { status: 400 })

    let zsetKey = ''
    let channelKey = ''
    let updateEvent = ''

    if (isGroupChat(chatId)) {
      const groupId = chatId.replace('group:', '')
      zsetKey = `group:${groupId}:messages`
      channelKey = toPusherKey(`group:${groupId}`)
      updateEvent = 'message_updated'

      // Ensure requester is a member of the group
      const members = (await fetchRedis('smembers', `group:${groupId}:members`)) as string[] | null
      if (!members || !members.includes(session.user.id)) {
        return new Response('Unauthorized', { status: 401 })
      }
    } else {
      // Direct message chat: validate participant
      const [userId1, userId2] = chatId.split('--')
      if (session.user.id !== userId1 && session.user.id !== userId2) {
        return new Response('Unauthorized', { status: 401 })
      }
      zsetKey = `chat:${chatId}:messages`
      channelKey = toPusherKey(`chat:${chatId}`)
      updateEvent = 'message-updated'
    }

    // Load messages from the zset
    const rawMessages = (await fetchRedis('zrange', zsetKey, 0, -1)) as string[] | null
    if (!rawMessages || rawMessages.length === 0) {
      return new Response('Message not found', { status: 404 })
    }

    // Find the exact stored string and parsed message
    let storedString: string | null = null
    let original: Message | null = null

    for (const s of rawMessages) {
      try {
        const m = JSON.parse(s) as Message
        if (m.id === messageId) {
          storedString = s
          original = m
          break
        }
      } catch {
        // ignore malformed entries
      }
    }

    if (!storedString || !original) {
      return new Response('Message not found', { status: 404 })
    }

    // Only the sender can unsend (Instagram-like behavior)
    if (original.senderId !== session.user.id) {
      return new Response('Forbidden', { status: 403 })
    }

    // If already tombstoned, do nothing (idempotent)
    const isAlreadyDeleted = original.text === '__deleted__'
    const score = original.timestamp ?? Date.now()

    const tombstone: Message = {
      ...original,
      text: '__deleted__',
      image: undefined,
      timestamp: score,
    }

    if (!isAlreadyDeleted) {
      // Remove original exact member and insert tombstone with original score
      await db.zrem(zsetKey, storedString)
      await db.zadd(zsetKey, {
        score,
        member: JSON.stringify(tombstone),
      })
    }

    // Notify clients to update the message
    await pusherServer.trigger(channelKey, updateEvent, tombstone)

    return new Response('OK')
  } catch (err) {
    if (err instanceof Error) {
      return new Response(err.message, { status: 500 })
    }
    return new Response('Internal Server Error', { status: 500 })
  }
}