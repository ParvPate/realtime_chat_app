import { getBearerUserId } from '@/lib/mobile-jwt'
import { db } from '@/lib/db'

type Body = { requesterId: string }

/**
 * Mobile: deny (remove) a pending incoming friend request.
 * Body: { requesterId: string }
 */
export async function POST(req: Request) {
  try {
    const userId = getBearerUserId(req)

    const body = (await req.json().catch(() => ({}))) as Partial<Body>
    const requesterId = String(body?.requesterId ?? '').trim()
    if (!requesterId) return new Response('Invalid body', { status: 400 })

    await db.srem(`user:${userId}:incoming_friend_requests`, requesterId)

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