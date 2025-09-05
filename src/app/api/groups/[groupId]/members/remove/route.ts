import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { GroupChat } from '@/types/db'

async function deleteGroupAndBroadcast(groupId: string, members: string[]) {
  // Remove group docs and indexes
  await db.del(`group:${groupId}`)
  await db.del(`group:${groupId}:info`)
  await db.del(`group:${groupId}:members`)
  await db.del(`group:${groupId}:messages`)
  await db.del(`groups:${groupId}`)

  // Remove from each user's set
  for (const uid of members) {
    await db.srem(`user:${uid}:groups`, groupId)
  }

  // Notify open group views (group channel) and impacted users
  await pusherServer.trigger(toPusherKey(`group:${groupId}`), 'group_deleted', { groupId })
  for (const uid of members) {
    await pusherServer.trigger(toPusherKey(`user:${uid}:groups`), 'group_deleted', { groupId })
  }
}

export async function POST(req: Request, { params }: { params: { groupId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const { memberId }: { memberId: string } = await req.json()
    const { groupId } = params

    // Load canonical group first; fallback to legacy shapes if missing
    let groupStr = (await fetchRedis('get', `group:${groupId}`)) as string | null
    if (!groupStr) {
      groupStr = (await fetchRedis('get', `groups:${groupId}`)) as string | null
    }
    if (!groupStr) return new Response('Group not found', { status: 404 })

    const raw: any = JSON.parse(groupStr)
    const group: GroupChat = {
      id: raw?.id ?? groupId,
      name: raw?.name ?? '',
      description: raw?.description ?? undefined,
      members: Array.isArray(raw?.members) ? raw.members : [],
      admins: Array.isArray(raw?.admins) ? raw.admins : (raw?.admin ? [raw.admin] : []),
      createdAt: typeof raw?.createdAt === 'number' ? raw.createdAt : Date.now(),
      createdBy: raw?.createdBy ?? (Array.isArray(raw?.admins) && raw.admins[0]) ?? raw?.admin ?? '',
      avatar: raw?.avatar ?? undefined,
    }

    // Only admins can remove members (non-admins should use the "leave" endpoint)
    if (!Array.isArray(group.admins) || !group.admins.includes(session.user.id)) {
      return new Response('Only admins can remove members', { status: 403 })
    }

    // Remove member
    const updatedMembers = group.members.filter(id => id !== memberId)
    let updatedAdmins = group.admins.filter(id => id !== memberId)

    // Maintain at least one admin if group remains
    if (updatedMembers.length > 0 && updatedAdmins.length === 0) {
      updatedAdmins = [updatedMembers[0]]
    }

    // Remove from group membership set and user's group listing
    await db.srem(`group:${groupId}:members`, memberId)
    await db.srem(`user:${memberId}:groups`, groupId)

    // If the group has shrunk to 2 or fewer members, delete the entire group
    if (updatedMembers.length <= 2) {
      await deleteGroupAndBroadcast(groupId, updatedMembers)
      // Also notify the removed member (already srem'd from set)
      await pusherServer.trigger(
        toPusherKey(`user:${memberId}:groups`),
        'group_deleted',
        { groupId }
      )
      return Response.json({ success: true, deleted: true })
    }

    // Otherwise persist the updated group
    const updatedGroup = {
      ...group,
      members: updatedMembers,
      admins: updatedAdmins,
    }
    await db.set(`group:${groupId}`, JSON.stringify(updatedGroup))

    // Notify remaining members of the update
    await pusherServer.trigger(
      updatedMembers.map(id => toPusherKey(`user:${id}:groups`)),
      'group_updated',
      updatedGroup
    )

    // Notify removed member that they left/were removed
    await pusherServer.trigger(
      toPusherKey(`user:${memberId}:groups`),
      'group_left',
      { groupId }
    )

    return Response.json({ success: true, deleted: false })
  } catch (error) {
    return new Response('Internal Error', { status: 500 })
  }
}