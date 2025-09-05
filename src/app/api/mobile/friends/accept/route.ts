import { getBearerUserId } from '@/lib/mobile-jwt'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'

type Body = { requesterId: string }

/**
 * Mobile: accept a friend request.
 * Body: { requesterId: string }
 */
export async function POST(req: Request) {
  try {
    const userId = getBearerUserId(req)

    const body = (await req.json().catch(() => ({}))) as Partial<Body>
    const requesterId = String(body?.requesterId ?? '').trim()
    if (!requesterId) return new Response('Invalid body', { status: 400 })

    // Already friends?
    const alreadyFriends = (await fetchRedis(
      'sismember',
      `user:${userId}:friends`,
      requesterId
    )) as 0 | 1
    if (alreadyFriends) {
      // ensure pending request removed idempotently
      await db.srem(`user:${userId}:incoming_friend_requests`, requesterId)
      return new Response('Already friends', { status: 200 })
    }

    // Ensure there is a pending request from requesterId -> userId
    const hasRequest = (await fetchRedis(
      'sismember',
      `user:${userId}:incoming_friend_requests`,
      requesterId
    )) as 0 | 1
    if (!hasRequest) {
      return new Response('No friend request', { status: 400 })
    }

    // Make friendship symmetric
    await db.sadd(`user:${userId}:friends`, requesterId)
    await db.sadd(`user:${requesterId}:friends`, userId)

    // Remove the pending request
    await db.srem(`user:${userId}:incoming_friend_requests`, requesterId)

    // Realtime notify both sides their friends list updated
    const [userRaw, friendRaw] = (await Promise.all([
      fetchRedis('get', `user:${userId}`),
      fetchRedis('get', `user:${requesterId}`),
    ])) as [string | null, string | null]

    let userPayload: any = { id: userId }
    let friendPayload: any = { id: requesterId }
    try {
      if (userRaw) userPayload = JSON.parse(userRaw)
    } catch {}
    try {
      if (friendRaw) friendPayload = JSON.parse(friendRaw)
    } catch {}

    await Promise.all([
      pusherServer.trigger(toPusherKey(`user:${userId}:friends`), 'new_friend', friendPayload),
      pusherServer.trigger(toPusherKey(`user:${requesterId}:friends`), 'new_friend', userPayload),
    ])

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