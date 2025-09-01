import { getBearerUserId } from '@/lib/mobile-jwt'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { groupPollMessageSchema } from '@/lib/validations/poll'

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

    const body = await req.json().catch(() => ({}))
    const optionIds: string[] = Array.isArray(body?.optionIds) ? body.optionIds : []
    if (!optionIds.length) return new Response('No optionIds provided', { status: 400 })

    // Load poll message from zset
    const zsetKey = `group:${groupId}:messages`
    const stored = (await fetchRedis('zrange', zsetKey, 0, -1)) as string[] | null
    if (!stored || !stored.length) return new Response('Poll not found', { status: 404 })

    let originalStr: string | null = null
    let original: any = null

    for (const s of stored) {
      try {
        const m = JSON.parse(s)
        if (m.id === messageId && m.type === 'poll' && m.poll) {
          originalStr = s
          original = m
          break
        }
      } catch {
        // ignore malformed
      }
    }

    if (!originalStr || !original) return new Response('Poll not found', { status: 404 })

    // Validate and normalize structure
    const pollMessage = groupPollMessageSchema.parse(original)

    // Expiry check
    if (pollMessage.poll.expiresAt && Date.now() >= pollMessage.poll.expiresAt) {
      return new Response('Poll expired', { status: 400 })
    }

    // Update votes
    const updatedOptions = pollMessage.poll.options.map((opt) => {
      // Remove this user's previous vote on this option
      const filteredVotes = opt.votes.filter((uid) => uid !== userId)
      // If user is selecting this option in this request, add it back
      if (optionIds.includes(opt.id)) {
        filteredVotes.push(userId)
      }
      return { ...opt, votes: filteredVotes }
    })

    // If multiple votes are not allowed, keep only one selected option for this user
    if (!pollMessage.poll.allowMultipleVotes) {
      // keep first of the requested optionIds that exists
      const requested = new Set(optionIds)
      let selectedOne: string | null = null
      for (const opt of updatedOptions) {
        if (requested.has(opt.id) && !selectedOne) {
          selectedOne = opt.id
        }
      }
      const normalized = updatedOptions.map((opt) => {
        if (selectedOne && opt.id !== selectedOne) {
          return { ...opt, votes: opt.votes.filter((uid) => uid !== userId) }
        }
        return opt
      })
      updatedOptions.splice(0, updatedOptions.length, ...normalized)
    }

    const totalVotes = updatedOptions.reduce((sum, o) => sum + o.votes.length, 0)
    const updatedMessage = {
      ...pollMessage,
      poll: {
        ...pollMessage.poll,
        options: updatedOptions,
        totalVotes,
      },
    }

    // Persist replacement with same score (timestamp)
    await db.zrem(zsetKey, originalStr)
    await db.zadd(zsetKey, {
      score: pollMessage.timestamp,
      member: JSON.stringify(updatedMessage),
    })

    // Realtime notify clients (same event name as web)
    await pusherServer.trigger(toPusherKey(`group:${groupId}`), 'poll-updated', updatedMessage)

    return new Response('OK', { status: 200 })
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