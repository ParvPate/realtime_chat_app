import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import type { GroupChat } from '@/types/db'

type Body = { groupId: string; memberId: string }

async function loadCanonicalGroup(groupId: string): Promise<GroupChat | null> {
  // Try canonical doc first
  const canonical = (await fetchRedis('get', `group:${groupId}`)) as string | null
  if (canonical) {
    try {
      return JSON.parse(canonical) as GroupChat
    } catch {
      // fallthrough to legacy
    }
  }

  // Legacy/fallback: info + members set
  const infoStr = (await fetchRedis('get', `group:${groupId}:info`)) as string | null
  const members = (await fetchRedis('smembers', `group:${groupId}:members`)) as string[] | null
  if (!infoStr || !members) return null

  try {
    const info = JSON.parse(infoStr) as any
    const group: GroupChat = {
      id: groupId,
      name: String(info?.name ?? 'Group'),
      description: undefined,
      members,
      admins: Array.isArray(info?.admins)
        ? info.admins
        : info?.createdBy
          ? [String(info.createdBy)]
          : [],
      createdAt: typeof info?.createdAt === 'number' ? info.createdAt : Date.now(),
      createdBy: String(info?.createdBy ?? ''),
      avatar: undefined,
    }
    return group
  } catch {
    return null
  }
}

async function deleteGroupAndBroadcast(groupId: string, members: string[]) {
  // Delete both canonical and legacy keys
  await db.del(`group:${groupId}`)
  await db.del(`groups:${groupId}`)
  await db.del(`group:${groupId}:info`)
  await db.del(`group:${groupId}:members`)
  await db.del(`group:${groupId}:messages`)
  await db.del(`chat:group:${groupId}:messages`) // legacy

  for (const uid of members) {
    await db.srem(`user:${uid}:groups`, groupId)
  }

  for (const uid of members) {
    await pusherServer.trigger(toPusherKey(`user:${uid}:groups`), 'group_deleted', { groupId })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const body = (await req.json().catch(() => ({}))) as Partial<Body>
    const groupId = String(body?.groupId ?? '').trim()
    const memberId = String(body?.memberId ?? '').trim()
    if (!groupId || !memberId) return new Response('Invalid body', { status: 400 })

    const group = await loadCanonicalGroup(groupId)
    if (!group) return new Response('Group not found', { status: 404 })

    // Compute effective admins to be backward-compatible with legacy groups
    const effectiveAdmins =
      Array.isArray(group.admins) && group.admins.length > 0
        ? group.admins
        : group.createdBy
          ? [group.createdBy]
          : group.members.length > 0
            ? [group.members[0]]
            : []

    // Admin-only removal (non-admins should use /api/groups/[groupId]/leave)
    if (!effectiveAdmins.includes(session.user.id)) {
      return new Response('Only admins can remove members', { status: 403 })
    }

    // No-op if member isn't in the group
    if (!group.members.includes(memberId)) {
      return new Response(JSON.stringify({ success: true, deleted: false, note: 'not_member' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const updatedMembers = group.members.filter((id) => id !== memberId)
    let updatedAdmins = effectiveAdmins.filter((id) => id !== memberId)

    // Maintain at least one admin if group remains
    if (updatedMembers.length > 0 && updatedAdmins.length === 0) {
      updatedAdmins = [updatedMembers[0]]
    }

    // Update membership sets
    await db.srem(`group:${groupId}:members`, memberId)
    await db.srem(`user:${memberId}:groups`, groupId)

    // If group size drops to 2 or less, delete group entirely
    if (updatedMembers.length <= 2) {
      await deleteGroupAndBroadcast(groupId, updatedMembers)
      // Notify removed member as well (already srem'd from set)
      await pusherServer.trigger(toPusherKey(`user:${memberId}:groups`), 'group_deleted', { groupId })
      return new Response(JSON.stringify({ success: true, deleted: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Persist updated group (canonical)
    const updatedGroup: GroupChat = { ...group, members: updatedMembers, admins: updatedAdmins }
    await db.set(`group:${groupId}`, JSON.stringify(updatedGroup))

    // Notify the open group view first so it can update member count immediately
    await pusherServer.trigger(toPusherKey(`group:${groupId}`), 'group_updated', updatedGroup)

    // Notify remaining members (their dashboards/sidebars)
    await pusherServer.trigger(
      updatedMembers.map((id) => toPusherKey(`user:${id}:groups`)),
      'group_updated',
      updatedGroup
    )

    // Notify removed member
    await pusherServer.trigger(toPusherKey(`user:${memberId}:groups`), 'group_left', { groupId })

    return new Response(JSON.stringify({ success: true, deleted: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response('Internal Error', { status: 500 })
  }
}