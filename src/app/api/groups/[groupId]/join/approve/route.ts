import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'

type Body = { requesterId: string }

/**
 * Approve a user's request to join a group.
 * - Only the group's admin/creator may approve.
 * - Adds requester to group members, updates sets and listing,
 *   and removes the join request records.
 * - Broadcasts group_updated to group and users, and notifies requester.
 */
export async function POST(req: Request, { params }: { params: { groupId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const { groupId } = await params 
    if (!groupId) return new Response('Invalid groupId', { status: 400 })

    const body = (await req.json().catch(() => ({}))) as Partial<Body>
    const requesterId = String(body?.requesterId ?? '').trim()
    if (!requesterId) return new Response('Invalid body', { status: 400 })

    // Load canonical group
    const raw = (await fetchRedis('get', `group:${groupId}`)) as string | null
    if (!raw) return new Response('Group not found', { status: 404 })

    let createdBy = ''
    let name = 'Group'
    let members: string[] = []
    let admins: string[] = []

    try {
      const g = JSON.parse(raw) as any
      createdBy = String(g?.createdBy ?? '')
      name = String(g?.name ?? name)
      members = Array.isArray(g?.members) ? g.members : []
      admins = Array.isArray(g?.admins) ? g.admins : []
    } catch {}

    // Admin check (createdBy or admins includes session user)
    const isAdmin =
      session.user.id === createdBy ||
      (Array.isArray(admins) && admins.includes(session.user.id))

    if (!isAdmin) return new Response('Forbidden', { status: 403 })

    // Ensure a pending request exists
    const hasPending = (await fetchRedis(
      'sismember',
      `group:${groupId}:join_requests`,
      requesterId
    )) as 0 | 1
    if (!hasPending) {
      return new Response('No pending request', { status: 400 })
    }

    // If already member, just remove the request idempotently
    if (members.includes(requesterId)) {
      await db.srem(`group:${groupId}:join_requests`, requesterId)
      // Remove admin inbox record
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
    }

    // Add to group members
    const updatedMembers = [...new Set([...members, requesterId])]
    const canonical = {
      id: groupId,
      name,
      createdBy,
      members: updatedMembers,
      admins: admins && admins.length ? admins : [createdBy],
    }

    // Persist canonical group doc
    await db.set(`group:${groupId}`, JSON.stringify({ ...canonical }))

    // Update membership sets
    await db.sadd(`group:${groupId}:members`, requesterId)
    await db.sadd(`user:${requesterId}:groups`, groupId)

    // Remove request
    await db.srem(`group:${groupId}:join_requests`, requesterId)
    // Remove admin inbox record
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

    // Broadcast updates
    await pusherServer.trigger(toPusherKey(`group:${groupId}`), 'group_updated', {
      id: groupId,
      name,
      members: updatedMembers,
    })

    for (const uid of updatedMembers) {
      await pusherServer.trigger(
        toPusherKey(`user:${uid}:groups`),
        'group_updated',
        { id: groupId, name, members: updatedMembers }
      )
    }

    // Notify requester that they were approved (optional channel)
    await pusherServer.trigger(
      toPusherKey(`user:${requesterId}:groups`),
      'group_created',
      { id: groupId, name, members: updatedMembers, admins: canonical.admins }
    )

    return new Response('OK')
  } catch (e) {
    return new Response('Internal Error', { status: 500 })
  }
}