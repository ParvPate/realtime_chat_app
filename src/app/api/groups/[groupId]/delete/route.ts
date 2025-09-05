import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import type { GroupChat } from '@/types/db'

async function deleteGroupAndBroadcast(groupId: string, members: string[]) {
  // Delete all group keys (supporting both current and legacy shapes)
  await db.del(`groups:${groupId}`)
  await db.del(`group:${groupId}`)
  await db.del(`group:${groupId}:info`)
  await db.del(`group:${groupId}:members`)
  await db.del(`group:${groupId}:messages`)
  await db.del(`chat:group:${groupId}:messages`) // legacy

  // Remove group from each member's listing set
  for (const uid of members) {
    await db.srem(`user:${uid}:groups`, groupId)
  }

  // Notify any open group view to close
  await pusherServer.trigger(toPusherKey(`group:${groupId}`), 'group_deleted', { groupId })

  // Notify all affected users
  for (const uid of members) {
    await pusherServer.trigger(toPusherKey(`user:${uid}:groups`), 'group_deleted', { groupId })
  }
}

export async function POST(req: Request, { params }: { params: { groupId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const { groupId } = params
    if (!groupId) return new Response('Invalid groupId', { status: 400 })

    const raw = (await fetchRedis('get', `groups:${groupId}`)) as string | null
    if (!raw) return new Response('Group not found', { status: 404 })

    const group = JSON.parse(raw) as GroupChat

    // Admin-only delete
    if (!group.admins.includes(session.user.id)) {
      return new Response('Only admins can delete the group', { status: 403 })
    }

    // Capture snapshot of members to notify and to srem
    const members = Array.isArray(group.members) ? group.members : []

    await deleteGroupAndBroadcast(groupId, members)

    return new Response(JSON.stringify({ success: true, deleted: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response('Internal Error', { status: 500 })
  }
}