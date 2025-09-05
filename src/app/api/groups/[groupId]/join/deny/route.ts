import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'

type Body = { requesterId: string }

/**
 * Deny/remove a pending join request.
 * - Only the group's admin/creator may deny.
 * - Removes the requester from group:{groupId}:join_requests
 * - Removes the record from user:{adminId}:group_join_requests inbox
 * - Emits 'group_join_inbox_updated' to update sidebar badge
 */
export async function POST(req: Request, { params }: { params: { groupId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const { groupId } = params
    if (!groupId) return new Response('Invalid groupId', { status: 400 })

    const body = (await req.json().catch(() => ({}))) as Partial<Body>
    const requesterId = String(body?.requesterId ?? '').trim()
    if (!requesterId) return new Response('Invalid body', { status: 400 })

    // Load group to determine admin/creator
    const raw = (await fetchRedis('get', `group:${groupId}`)) as string | null
    if (!raw) return new Response('Group not found', { status: 404 })

    let createdBy = ''
    let admins: string[] = []
    try {
      const g = JSON.parse(raw) as any
      createdBy = String(g?.createdBy ?? '')
      admins = Array.isArray(g?.admins) ? g.admins : []
    } catch {}

    const isAdmin =
      session.user.id === createdBy ||
      (Array.isArray(admins) && admins.includes(session.user.id))

    if (!isAdmin) return new Response('Forbidden', { status: 403 })

    // Remove from pending set
    await db.srem(`group:${groupId}:join_requests`, requesterId)

    // Remove admin inbox record(s)
    const inbox = (await fetchRedis(
      'smembers',
      `user:${session.user.id}:group_join_requests`
    )) as string[] | null

    if (inbox && inbox.length) {
      for (const s of inbox) {
        try {
          const r = JSON.parse(s) as any
          if (r?.groupId === groupId && r?.requesterId === requesterId) {
            await db.srem(`user:${session.user.id}:group_join_requests`, s)
          }
        } catch {}
      }
    }

    // Notify admin sidebar badge count update
    {
      const remaining = (await fetchRedis(
        'smembers',
        `user:${session.user.id}:group_join_requests`
      )) as string[] | null
      await pusherServer.trigger(
        toPusherKey(`user:${session.user.id}:group_entry_requests`),
        'group_join_inbox_updated',
        { count: (remaining ?? []).length, action: 'removed', groupId, requesterId }
      )
    }

    return new Response('OK')
  } catch (e) {
    return new Response('Internal Error', { status: 500 })
  }
}