import { getBearerUserId } from '@/lib/mobile-jwt'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'

type Body = { email?: string; friendId?: string }

/**
 * Mobile: send a friend request.
 * Accepts either:
 *  - { email: string }  (resolves to user id)
 *  - { friendId: string } (direct user id)
 */
export async function POST(req: Request) {
  try {
    const userId = getBearerUserId(req)

    const body = (await req.json().catch(() => ({}))) as Body
    let targetId = ''

    if (typeof body.friendId === 'string' && body.friendId.trim().length > 0) {
      targetId = body.friendId.trim()
    } else if (typeof body.email === 'string' && body.email.trim().length > 0) {
      const id = (await fetchRedis('get', `user:email:${body.email.trim()}`)) as string | null
      if (id) targetId = id
    }

    if (!targetId) {
      return new Response('Provide email or friendId', { status: 400 })
    }

    if (targetId === userId) {
      return new Response('You cannot add yourself as a friend', { status: 400 })
    }

    // Already requested?
    const alreadyRequested = (await fetchRedis(
      'sismember',
      `user:${targetId}:incoming_friend_requests`,
      userId
    )) as 0 | 1
    if (alreadyRequested) {
      return new Response('Already added this user', { status: 400 })
    }

    // Already friends?
    const alreadyFriends = (await fetchRedis(
      'sismember',
      `user:${userId}:friends`,
      targetId
    )) as 0 | 1
    if (alreadyFriends) {
      return new Response('Already friends with this user', { status: 400 })
    }

    // Create incoming_friend_request for target
    await db.sadd(`user:${targetId}:incoming_friend_requests`, userId)

    // Notify target user in realtime
    const rawSender = (await fetchRedis('get', `user:${userId}`)) as string | null
    let senderEmail = ''
    if (rawSender) {
      try {
        const u = JSON.parse(rawSender)
        senderEmail = String(u?.email ?? '')
      } catch {}
    }

    await pusherServer.trigger(
      toPusherKey(`user:${targetId}:incoming_friend_requests`),
      'incoming_friend_requests',
      { senderId: userId, senderEmail }
    )

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