import { fetchRedis } from '@/helpers/redis'
import { getBearerUserId } from '@/lib/mobile-jwt'

export async function GET(req: Request) {
  try {
    const userId = getBearerUserId(req)
    const raw = (await fetchRedis('get', `user:${userId}`)) as string | null
    if (!raw) return new Response('User not found', { status: 404 })

    return new Response(raw, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal Server Error'
    const code = msg === 'Missing Bearer token' || msg === 'Invalid token signature' || msg === 'Token expired' ? 401 : 500
    return new Response(msg, { status: code })
  }
}