import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { groupPollMessageSchema } from '@/lib/validations/poll'

export async function POST(req: Request, { params }: { params: { groupId: string; messageId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const { groupId, messageId } = params
    if (!groupId || !messageId) return new Response('Invalid params', { status: 400 })

    // Ensure member
    const memberIds = (await fetchRedis('smembers', `group:${groupId}:members`)) as string[] | null
    if (!memberIds || !memberIds.includes(session.user.id)) {
      return new Response('Unauthorized', { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const optionIds: string[] = Array.isArray(body?.optionIds) ? body.optionIds : []
    if (!optionIds.length) return new Response('No optionIds provided', { status: 400 })

    // Load all messages and find the poll message
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
        // ignore bad entry
      }
    }

    if (!originalStr || !original) return new Response('Poll not found', { status: 404 })

    // Validate structure (ensures fields like allowMultipleVotes, options, etc.)
    const pollMessage = groupPollMessageSchema.parse(original)

    // Expiry check
    if (pollMessage.poll.expiresAt && Date.now() >= pollMessage.poll.expiresAt) {
      return new Response('Poll expired', { status: 400 })
    }

    // Update votes
    const updatedOptions = pollMessage.poll.options.map((opt) => {
      // Remove user's previous vote from this option
      const filteredVotes = opt.votes.filter((uid) => uid !== session.user.id)
      // If this option is being selected in this vote request, add user
      if (optionIds.includes(opt.id)) {
        filteredVotes.push(session.user.id)
      }
      return { ...opt, votes: filteredVotes }
    })

    // If multiple votes are not allowed, ensure only one selection remains
    if (!pollMessage.poll.allowMultipleVotes) {
      // Keep the first selected option that exists in updatedOptions, remove user from others
      const selectedSet = new Set(optionIds)
      let selectedOne: string | null = null
      for (const opt of updatedOptions) {
        if (selectedSet.has(opt.id) && !selectedOne) {
          selectedOne = opt.id
        }
      }
      const normalized = updatedOptions.map((opt) => {
        if (selectedOne && opt.id !== selectedOne) {
          return { ...opt, votes: opt.votes.filter((uid) => uid !== session.user.id) }
        }
        return opt
      })
      // replace with normalized
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

    // Replace in zset maintaining original timestamp score
    await db.zrem(zsetKey, originalStr)
    await db.zadd(zsetKey, {
      score: pollMessage.timestamp,
      member: JSON.stringify(updatedMessage),
    })

    // Notify clients
    await pusherServer.trigger(toPusherKey(`group:${groupId}`), 'poll-updated', updatedMessage)

    return new Response('OK', { status: 200 })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal Server Error'
    return new Response(msg, { status: 500 })
  }
}