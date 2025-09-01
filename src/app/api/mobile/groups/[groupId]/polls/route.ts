import { getBearerUserId } from '@/lib/mobile-jwt'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { nanoid } from 'nanoid'
import { groupPollMessageSchema, pollOptionSchema, type GroupPollMessage, type PollOption } from '@/lib/validations/poll'
import { messageArrayValidator, type Message } from '@/lib/validations/message'

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

    // Load all messages in the group and filter for polls
    const raw = (await fetchRedis('zrange', `group:${groupId}:messages`, 0, -1)) as string[] | null
    const all = (raw ?? [])
      .map((s) => {
        try {
          return JSON.parse(s) as Message | GroupPollMessage
        } catch {
          return null
        }
      })
      .filter(Boolean) as Array<Message | GroupPollMessage>

    const polls = all.filter((m: any) => m && (m as any).type === 'poll')
    // Validate shape for safety
    const validated = polls
      .map((m) => {
        try {
          return groupPollMessageSchema.parse(m)
        } catch {
          return null
        }
      })
      .filter(Boolean)

    return new Response(JSON.stringify({ polls: validated }), {
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
    const question: string = (body?.question ?? '').trim()
    const rawOptions: string[] = Array.isArray(body?.options) ? body.options : []
    const allowMultipleVotes: boolean = Boolean(body?.allowMultipleVotes)
    const anonymous: boolean = Boolean(body?.anonymous)
    const expiresIn: number | null =
      typeof body?.expiresIn === 'number' && isFinite(body.expiresIn) && body.expiresIn > 0
        ? Math.floor(body.expiresIn)
        : null

    if (!question) return new Response('Question required', { status: 400 })
    const cleanOptions = rawOptions.map((s) => String(s ?? '').trim()).filter(Boolean)
    if (cleanOptions.length < 2) return new Response('At least 2 options required', { status: 400 })

    const now = Date.now()
    const options: PollOption[] = cleanOptions.map((text) => ({
      id: nanoid(),
      text,
      votes: [],
    }))

    // quick validate poll option shapes
    for (const opt of options) pollOptionSchema.parse(opt)

    const message: GroupPollMessage = groupPollMessageSchema.parse({
      id: nanoid(),
      senderId: userId,
      text: `Poll: ${question}`,
      timestamp: now,
      type: 'poll',
      poll: {
        question,
        options,
        totalVotes: 0,
        allowMultipleVotes,
        anonymous,
        expiresAt: expiresIn ? now + expiresIn : undefined,
      },
    })

    // Persist
    await db.zadd(`group:${groupId}:messages`, {
      score: now,
      member: JSON.stringify(message),
    })

    // Realtime
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