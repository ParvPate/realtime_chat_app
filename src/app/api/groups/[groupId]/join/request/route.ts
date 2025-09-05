import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'

/**
 * Request to join a group.
 * - Only logged-in users can request.
 * - Stores requester in group:{groupId}:join_requests (set of userIds)
 * - Adds an admin-visible record in user:{adminId}:group_join_requests (set of JSON)
 * - Notifies admin via pusher on user:{adminId}:group_entry_requests with event 'group_join_requested'
 */
export async function POST(req: Request, { params }: { params: { groupId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const { groupId } = params
    if (!groupId) return new Response('Invalid groupId', { status: 400 })

    // Load canonical group to find admin/createdBy
    const raw = (await fetchRedis('get', `group:${groupId}`)) as string | null
    if (!raw) return new Response('Group not found', { status: 404 })

    let createdBy = ''
    let members: string[] = []
    let name = 'Group'
    try {
      const g = JSON.parse(raw) as any
      createdBy = String(g?.createdBy ?? '')
      members = Array.isArray(g?.members) ? g.members : []
      name = String(g?.name ?? name)
    } catch {
      // fallback to info for createdBy
      const info = (await fetchRedis('get', `group:${groupId}:info`)) as string | null
      if (info) {
        try {
          const i = JSON.parse(info) as any
          createdBy = String(i?.createdBy ?? '')
          name = String(i?.name ?? name)
        } catch {}
      }
    }

    if (!createdBy) {
      return new Response('Group misconfigured (no admin)', { status: 500 })
    }

    // If already a member, block
    if (members.includes(session.user.id)) {
      return new Response('Already a member', { status: 400 })
    }

    // Avoid duplicate requests
    const alreadyRequested = (await fetchRedis(
      'sismember',
      `group:${groupId}:join_requests`,
      session.user.id
    )) as 0 | 1
    if (alreadyRequested) {
      return new Response('Already requested', { status: 200 })
    }

    // Persist request
    await db.sadd(`group:${groupId}:join_requests`, session.user.id)

    // Add to admin's request inbox
    const record = JSON.stringify({
      groupId,
      requesterId: session.user.id,
      requesterEmail: session.user.email,
      requesterName: session.user.name,
      requestedAt: Date.now(),
      groupName: name,
    })
    await db.sadd(`user:${createdBy}:group_join_requests`, record)

    // Notify admin via realtime channel
    await pusherServer.trigger(
      toPusherKey(`user:${createdBy}:group_entry_requests`),
      'group_join_requested',
      { groupId, requesterId: session.user.id, groupName: name, requesterName: session.user.name }
    )

    return new Response('OK')
  } catch (e) {
    return new Response('Internal Error', { status: 500 })
  }
}