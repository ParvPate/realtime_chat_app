import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import type { GroupChat } from '@/types/db'

type Body =
  | { groupId: string; email: string }
  | { groupId: string; memberIds: string[] }

async function loadCanonicalGroup(groupId: string): Promise<GroupChat | null> {
  // Canonical doc
  const canonical = (await fetchRedis('get', `group:${groupId}`)) as string | null
  if (canonical) {
    try {
      return JSON.parse(canonical) as GroupChat
    } catch {
      // fallthrough
    }
  }

  // Fallback to legacy info + members set
  const infoStr = (await fetchRedis('get', `group:${groupId}:info`)) as string | null
  const members = (await fetchRedis('smembers', `group:${groupId}:members`)) as string[] | null
  if (!infoStr) return null

  try {
    const info = JSON.parse(infoStr) as any
    const group: GroupChat = {
      id: groupId,
      name: String(info?.name ?? 'Group'),
      description: undefined,
      // allow missing members set for legacy groups
      members: Array.isArray(members) ? members : [],
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

async function resolveEmailToFriendId(userId: string, email: string): Promise<string | null> {
  const friendIds = (await fetchRedis('smembers', `user:${userId}:friends`)) as string[] | null
  if (!friendIds || friendIds.length === 0) return null
  const target = String(email).trim().toLowerCase()
  for (const fid of friendIds) {
    const raw = (await fetchRedis('get', `user:${fid}`)) as string | null
    if (!raw) continue
    try {
      const u = JSON.parse(raw) as { email?: string }
      if (u?.email && String(u.email).trim().toLowerCase() === target) {
        return fid
      }
    } catch {
      // ignore malformed
    }
  }
  return null
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const body = (await req.json().catch(() => ({}))) as Partial<Body> & { groupId?: string }
    const groupId = String(body?.groupId ?? '').trim()
    if (!groupId) return new Response('Invalid groupId', { status: 400 })

    const group = await loadCanonicalGroup(groupId)
    if (!group) return new Response('Group not found', { status: 404 })

    // Admin-only
    if (!Array.isArray(group.admins) || !group.admins.includes(session.user.id)) {
      return new Response('Only admins can add members', { status: 403 })
    }

    // Determine member IDs to add
    const toAdd = new Set<string>()
    if (Array.isArray((body as any).memberIds)) {
      for (const id of (body as any).memberIds as string[]) {
        const s = String(id ?? '').trim()
        if (s) toAdd.add(s)
      }
    } else if (typeof (body as any).email === 'string') {
      const fid = await resolveEmailToFriendId(session.user.id, (body as any).email as string)
      if (!fid) return new Response('Email is not a friend or not found', { status: 400 })
      toAdd.add(fid)
    } else {
      return new Response('Provide memberIds or email', { status: 400 })
    }

    // Remove existing members and self
    for (const m of group.members) toAdd.delete(m)
    toAdd.delete(session.user.id)

    if (toAdd.size === 0) {
      return new Response('No new members to add', { status: 400 })
    }

    const newMembers = Array.from(toAdd)
    const updatedMembers = [...group.members, ...newMembers]
    const updatedGroup: GroupChat = { ...group, members: updatedMembers }

    // Persist canonical group
    await db.set(`group:${groupId}`, JSON.stringify(updatedGroup))

    // Maintain sets for lookups/authorization
    for (const memberId of newMembers) {
      await db.sadd(`group:${groupId}:members`, memberId)
      await db.sadd(`user:${memberId}:groups`, groupId)
    }

    // Notify all members about update
    await pusherServer.trigger(
      updatedMembers.map((id) => toPusherKey(`user:${id}:groups`)),
      'group_updated',
      updatedGroup
    )

    return new Response(JSON.stringify({ success: true, added: newMembers }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response('Internal Error', { status: 500 })
  }
}