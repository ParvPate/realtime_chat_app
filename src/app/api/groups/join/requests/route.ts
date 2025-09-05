import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchRedis } from '@/helpers/redis'

type JoinRequest = {
  groupId: string
  requesterId: string
  requesterEmail?: string
  requestedAt: number
  groupName?: string
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const raw = (await fetchRedis('smembers', `user:${session.user.id}:group_join_requests`)) as
      | string[]
      | null

    const items: JoinRequest[] = (raw ?? [])
      .map((s) => {
        try {
          return JSON.parse(s) as JoinRequest
        } catch {
          return null
        }
      })
      .filter(Boolean) as JoinRequest[]

    // Sort newest first
    items.sort((a, b) => (b.requestedAt ?? 0) - (a.requestedAt ?? 0))

    return new Response(JSON.stringify({ requests: items }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response('Internal Error', { status: 500 })
  }
}