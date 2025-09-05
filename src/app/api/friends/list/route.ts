import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchRedis } from '@/helpers/redis'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const userId = session.user.id
    const friendIds = (await fetchRedis('smembers', `user:${userId}:friends`)) as string[] | null
    const ids = Array.isArray(friendIds) ? friendIds : []

    const friends = await Promise.all(
      ids.map(async (id) => {
        const raw = (await fetchRedis('get', `user:${id}`)) as string | null
        if (!raw) return null
        try {
          const u = JSON.parse(raw)
          return {
            id,
            name: u?.name ?? 'Unknown',
            email: u?.email ?? 'unknown@example.com',
            image: u?.image ?? null,
          }
        } catch {
          return null
        }
      })
    )

    const list = friends.filter(Boolean)
    return new Response(JSON.stringify({ friends: list }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response('Internal Error', { status: 500 })
  }
}