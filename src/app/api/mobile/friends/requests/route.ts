import { getBearerUserId } from '@/lib/mobile-jwt'
import { fetchRedis } from '@/helpers/redis'

type DbUser = {
  id: string
  name: string
  email: string
  image?: string | null
}

export async function GET(req: Request) {
  try {
    const userId = getBearerUserId(req)

    const requesterIds = (await fetchRedis(
      'smembers',
      `user:${userId}:incoming_friend_requests`
    )) as string[] | null

    const ids = requesterIds ?? []

    const incoming: DbUser[] = await Promise.all(
      ids.map(async (id) => {
        const raw = (await fetchRedis('get', `user:${id}`)) as string | null
        if (!raw) return { id, name: 'Unknown', email: 'unknown@example.com' }
        try {
          const u = JSON.parse(raw)
          return { id: u.id, name: u.name, email: u.email, image: u.image }
        } catch {
          return { id, name: 'Unknown', email: 'unknown@example.com' }
        }
      })
    )

    return new Response(JSON.stringify({ incoming }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
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