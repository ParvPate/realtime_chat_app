import { getBearerUserId } from '@/lib/mobile-jwt'
import { db, isGroupChat } from '@/lib/db'
import { fetchRedis } from '@/helpers/redis'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import type { Message } from '@/lib/validations/message'

type Body = {
  chatId: string
  messageId: string
  emoji: string
}

function sanitizeEmoji(e: string) {
  if (typeof e !== 'string') return ''
  const s = e.trim()
  if (s.length === 0 || s.length > 8) return ''
  return s
}

export async function POST(req: Request) {
  try {
    const userId = getBearerUserId(req)

    const body = (await req.json().catch(() => ({}))) as Partial<Body>
    const chatId = String(body?.chatId ?? '')
    const messageId = String(body?.messageId ?? '')
    const em = sanitizeEmoji(String(body?.emoji ?? ''))

    if (!chatId || !messageId || !em) {
      return new Response('Invalid body', { status: 400 })
    }

    let zsetKey = ''
    let channelKey = ''
    let updateEvent = ''

    if (isGroupChat(chatId)) {
      const groupId = chatId.replace('group:', '')
      // Ensure member
      const members = (await fetchRedis('smembers', `group:${groupId}:members`)) as string[] | null
      if (!members || !members.includes(userId)) {
        return new Response('Unauthorized', { status: 401 })
      }
      zsetKey = `group:${groupId}:messages`
      channelKey = toPusherKey(`group:${groupId}`)
      updateEvent = 'message_updated'
    } else {
      // 1-1 chat
      const [a, b] = chatId.split('--')
      if (userId !== a && userId !== b) {
        return new Response('Unauthorized', { status: 401 })
      }
      const friendId = userId === a ? b : a

      // Optional: friendship check to mirror send route behavior
      const friendList = (await fetchRedis('smembers', `user:${userId}:friends`)) as string[] | null
      const isFriend = !!friendList?.includes(friendId)
      if (!isFriend) return new Response('Unauthorized', { status: 401 })

      zsetKey = `chat:${chatId}:messages`
      channelKey = toPusherKey(`chat:${chatId}`)
      updateEvent = 'message-updated'
    }

    // Load all to find target
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
        // ignore malformed entries
      }
    }

    if (!storedString || !original) {
      return new Response('Message not found', { status: 404 })
    }

    // Toggle user reaction (at most one active emoji per user)
    const reactions: Record<string, string[]> = (original as any).reactions || {}

    const prevHadSame = Array.isArray(reactions[em]) && reactions[em].includes(userId)

    // Remove user from all emoji arrays
    for (const key of Object.keys(reactions)) {
      if (Array.isArray(reactions[key])) {
        reactions[key] = reactions[key].filter((uid) => uid !== userId)
      }
    }

    // If previously didn't have the same emoji, add it; otherwise they un-reacted
    if (!prevHadSame) {
      const arr: string[] = Array.isArray(reactions[em]) ? reactions[em] : []
      arr.push(userId)
      reactions[em] = arr
    }

    // Cleanup empties
    for (const key of Object.keys(reactions)) {
      if (!Array.isArray(reactions[key]) || reactions[key].length === 0) {
        delete reactions[key]
      }
    }

    const updated: Message = {
      ...original,
      reactions,
    }
    const score = original.timestamp ?? Date.now()

    // Replace entry in zset
    await db.zrem(zsetKey, storedString)
    await db.zadd(zsetKey, {
      score,
      member: JSON.stringify(updated),
    })

    // Notify clients
    await pusherServer.trigger(channelKey, updateEvent, updated)

    return new Response('OK')
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