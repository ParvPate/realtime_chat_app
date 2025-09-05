import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { GroupChat } from '@/types/db'

async function deleteGroupAndBroadcast(groupId: string, members: string[]) {
  // Delete all known keys for both legacy and current shapes
  await db.del(`groups:${groupId}`)
  await db.del(`group:${groupId}`)
  await db.del(`group:${groupId}:info`)
  await db.del(`group:${groupId}:members`)
  await db.del(`group:${groupId}:messages`)
  await db.del(`chat:group:${groupId}:messages`) // legacy key

  // Remove from each user's set
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

    // Load canonical group first, fallback to listing, then to info + member set
    let rawCanonical = (await fetchRedis('get', `group:${groupId}`)) as string | null
    let group: GroupChat | null = null
 
    if (rawCanonical) {
      try {
        const g = JSON.parse(rawCanonical) as any
        group = {
          id: g?.id ?? groupId,
          name: g?.name ?? '',
          description: g?.description ?? undefined,
          members: Array.isArray(g?.members) ? g.members : [],
          admins: Array.isArray(g?.admins) ? g.admins : (g?.admin ? [g.admin] : []),
          createdAt: typeof g?.createdAt === 'number' ? g.createdAt : Date.now(),
          createdBy: g?.createdBy ?? (Array.isArray(g?.admins) && g.admins[0]) ?? g?.admin ?? '',
          avatar: g?.avatar ?? undefined,
        }
      } catch {}
    }
    if (!group) {
      const rawListing = (await fetchRedis('get', `groups:${groupId}`)) as string | null
      if (rawListing) {
        try {
          const l = JSON.parse(rawListing) as any
          // minimal fallback; we'll hydrate members from the set
          const memberSet = (await fetchRedis('smembers', `group:${groupId}:members`)) as string[] | null
          group = {
            id: l?.id ?? groupId,
            name: l?.name ?? '',
            description: undefined,
            members: Array.isArray(memberSet) ? memberSet : [],
            admins: [],
            createdAt: Date.now(),
            createdBy: '',
            avatar: undefined,
          }
        } catch {}
      }
    }
    if (!group) return new Response('Group not found', { status: 404 })
 
    if (!group.members.includes(session.user.id)) {
      return new Response('Not a member', { status: 400 })
    }

    // Remove user from group
    const updatedMembers = group.members.filter((id) => id !== session.user.id)
    let updatedAdmins = group.admins.filter((id) => id !== session.user.id)

    // Update membership set
    await db.srem(`group:${groupId}:members`, session.user.id)

    // If group shrinks to two or fewer, delete the group
    if (updatedMembers.length <= 2) {
      await deleteGroupAndBroadcast(groupId, updatedMembers)
      // Also notify the user who left
      await pusherServer.trigger(toPusherKey(`user:${session.user.id}:groups`), 'group_deleted', { groupId })
      return Response.json({ success: true, deleted: true })
    }

    // Ensure at least one admin remains
    if (updatedAdmins.length === 0 && updatedMembers.length > 0) {
      updatedAdmins = [updatedMembers[0]]
    }

    const updatedGroup: GroupChat = {
      ...group,
      members: updatedMembers,
      admins: updatedAdmins,
    }

    // Persist updated group doc (canonical) and keep listing in sync
    await db.set(`group:${groupId}`, JSON.stringify(updatedGroup))
    await db.set(`groups:${groupId}`, JSON.stringify({ id: groupId, name: updatedGroup.name, image: null }))
 
    // Notify remaining members
    await pusherServer.trigger(
      updatedMembers.map((id) => toPusherKey(`user:${id}:groups`)),
      'group_updated',
      updatedGroup,
    )

    // Remove group from user's list
    await db.srem(`user:${session.user.id}:groups`, groupId)

    return Response.json({ success: true, deleted: false })
  } catch (error) {
    return new Response('Internal Error', { status: 500 })
  }
}