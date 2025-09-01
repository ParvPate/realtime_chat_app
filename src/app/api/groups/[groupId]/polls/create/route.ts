import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { nanoid } from 'nanoid'
import { groupPollMessageSchema, type PollOption } from '@/lib/validations/poll'

export async function POST(req: Request, { params }: { params: { groupId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const { groupId } = params
    if (!groupId) return new Response('Invalid groupId', { status: 400 })

    // Ensure member
    const memberIds = (await fetchRedis('smembers', `group:${groupId}:members`)) as string[] | null
    if (!memberIds || !memberIds.includes(session.user.id)) {
      return new Response('Unauthorized', { status: 401 })
    }

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

    const payload = {
      id: nanoid(),
      senderId: session.user.id,
      text: `Poll: ${question}`,
      timestamp: now,
      type: 'poll' as const,
      poll: {
        question,
        options,
        totalVotes: 0,
        allowMultipleVotes,
        anonymous,
        expiresAt: expiresIn ? now + expiresIn : undefined,
      },
    }

    const message = groupPollMessageSchema.parse(payload)

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
    return new Response(msg, { status: 500 })
  }
}