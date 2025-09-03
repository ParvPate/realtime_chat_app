import { getBearerUserId } from '@/lib/mobile-jwt'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import type { Message } from '@/lib/validations/message'

async function ensureMember(userId: string, groupId: string) {
  const members = (await fetchRedis('smembers', `group:${groupId}:members`)) as string[] | null
  if (!members || !members.includes(userId)) {
    throw new Error('Unauthorized')
  }
}

export async function POST(
  req: Request,
  { params }: { params: { groupId: string; messageId: string } }
) {
  try {
    const userId = getBearerUserId(req)
    const { groupId, messageId } = params
    if (!groupId || !messageId) return new Response('Invalid params', { status: 400 })

    await ensureMember(userId, groupId)

    const zsetKey = `group:${groupId}:messages`
    const channelKey = toPusherKey(`group:${groupId}`)
    const updateEvent = 'message_updated'

    // Load all messages and locate the target
    const rawMessages = (await fetchRedis('zrange', zsetKey, 0, -1)) as string[] | null
    if (!rawMessages || rawMessages.length === 0) {
      return new Response('Message not found', { status: 404 })
    }

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
        // ignore bad entry
      }
    }

    if (!storedString || !original) {
      return new Response('Message not found', { status: 404 })
    }

    // Only sender can unsend
    if (original.senderId !== userId) {
      return new Response('Forbidden', { status: 403 })
    }

    const isAlreadyDeleted = original.text === '__deleted__'
    const score = original.timestamp ?? Date.now()

    const tombstone: Message = {
      ...original,
      text: '__deleted__',
      image: undefined,
      timestamp: score,
    }

    if (!isAlreadyDeleted) {
      await db.zrem(zsetKey, storedString)
      await db.zadd(zsetKey, {
        score,
        member: JSON.stringify(tombstone),
      })
    }

    await pusherServer.trigger(channelKey, updateEvent, tombstone)

    return new Response(JSON.stringify({ success: true, message: tombstone }), {
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