import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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
  // allow short unicode emoji or common short strings
  if (typeof e !== 'string') return ''
  const s = e.trim()
  // Basic length guard
  if (s.length === 0 || s.length > 8) return ''
  return s
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const { chatId, messageId, emoji } = (await req.json()) as Body
    const em = sanitizeEmoji(emoji)
    if (!chatId || !messageId || !em) return new Response('Invalid body', { status: 400 })

    let zsetKey = ''
    let channelKey = ''
    let updateEvent = ''

    if (isGroupChat(chatId)) {
      const groupId = chatId.replace('group:', '')
      // Ensure member
      const members = (await fetchRedis('smembers', `group:${groupId}:members`)) as string[] | null
      if (!members || !members.includes(session.user.id)) {
        return new Response('Unauthorized', { status: 401 })
      }
      zsetKey = `group:${groupId}:messages`
      channelKey = toPusherKey(`group:${groupId}`)
      updateEvent = 'message_updated'
    } else {
      // 1-1 chat
      const [userId1, userId2] = chatId.split('--')
      if (session.user.id !== userId1 && session.user.id !== userId2) {
        return new Response('Unauthorized', { status: 401 })
      }
      const friendId = session.user.id === userId1 ? userId2 : userId1

      // Optional friendship check (consistent with send)
      const friendList = (await fetchRedis('smembers', `user:${session.user.id}:friends`)) as string[] | null
      const isFriend = !!friendList?.includes(friendId)
      if (!isFriend) return new Response('Unauthorized', { status: 401 })

      zsetKey = `chat:${chatId}:messages`
      channelKey = toPusherKey(`chat:${chatId}`)
      updateEvent = 'message-updated'
    }

    // load all to find target message
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

    // Toggle user reaction for emoji (enforce at most one emoji per user per message)
    const userId = session.user.id
    const reactions = (original as any).reactions || {}

    // Did the user already have this same emoji?
    const prevHadSame =
      Array.isArray(reactions[em]) && reactions[em].includes(userId)

    // Remove user from all emoji arrays to ensure only one active reaction
    for (const key of Object.keys(reactions)) {
      if (Array.isArray(reactions[key])) {
        reactions[key] = reactions[key].filter((uid: string) => uid !== userId)
      }
    }

    // If they didn't previously have the same emoji, set this as their new reaction
    if (!prevHadSame) {
      const arr: string[] = Array.isArray(reactions[em]) ? reactions[em] : []
      arr.push(userId)
      reactions[em] = arr
    }

    // Clean up empty arrays to keep payload small
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

    // replace in zset
    await db.zrem(zsetKey, storedString)
    await db.zadd(zsetKey, {
      score,
      member: JSON.stringify(updated),
    })

    // notify clients
    await pusherServer.trigger(channelKey, updateEvent, updated)

    return new Response('OK')
  } catch (error) {
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 })
    }
    return new Response('Internal Server Error', { status: 500 })
  }
}