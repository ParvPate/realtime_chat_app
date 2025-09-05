import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { fetchRedis } from '@/helpers/redis'
import { nanoid } from 'nanoid'
import type { GroupChat } from '@/types/db'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const body = await req.json()
    const name: string = body?.name
    const membersInput: unknown = body?.members

    if (!name || typeof name !== 'string') {
      return new Response('Invalid group name', { status: 400 })
    }
    if (!Array.isArray(membersInput)) {
      return new Response('Invalid members array', { status: 400 })
    }

    // Normalize inputs (UI currently sends emails; accept friend IDs or emails)
    const normalizedInputs = (membersInput as unknown[])
      .map((v) => String(v ?? '').trim())
      .filter((s) => s.length > 0)

    // Get current user's friends (IDs) to constrain and resolve emails -> IDs
    const friendIds = (await fetchRedis(
      'smembers',
      `user:${session.user.id}:friends`
    )) as string[] | null

    const emailToId = new Map<string, string>()
    if (friendIds && friendIds.length) {
      await Promise.all(
        friendIds.map(async (fid) => {
          const raw = (await fetchRedis('get', `user:${fid}`)) as string | null
          if (!raw) return
          try {
            const u = JSON.parse(raw)
            if (u?.email) emailToId.set(String(u.email).toLowerCase(), fid)
          } catch {
            // ignore bad user doc
          }
        })
      )
    }

    const resolvedIds = new Set<string>()
    for (const token of normalizedInputs) {
      if (token.includes('@')) {
        // treat as email, resolve within friends
        const id = emailToId.get(token.toLowerCase())
        if (id) resolvedIds.add(id)
      } else {
        // treat as id, ensure it's a friend
        if (friendIds?.includes(token)) resolvedIds.add(token)
      }
    }

    // Do not allow empty (must have at least one other member)
    resolvedIds.delete(session.user.id)
    const memberIds = Array.from(resolvedIds)
    // Require at least 2 friends selected so total participants >= 3 (you + 2 friends)
    if (memberIds.length < 2) {
      return new Response('At least 2 friends are required to create a group', { status: 400 })
    }

    const now = Date.now()
    const groupId = nanoid()
    const groupKey = `group:${groupId}`

    // Canonical group object for storage (use admins array)
    const groupData = {
      id: groupId,
      name,
      admins: [session.user.id],
      members: [session.user.id, ...memberIds],
      createdAt: now,
      createdBy: session.user.id,
    }

    // Persist canonical group
    await db.set(groupKey, JSON.stringify(groupData))
    // Members set used for authorization/lookups
    await db.sadd(`${groupKey}:members`, session.user.id, ...memberIds)

    // Info doc for /groups/[groupId] page
    const info = {
      id: groupId,
      name,
      createdBy: session.user.id,
      createdAt: now,
    }
    await db.set(`group:${groupId}:info`, JSON.stringify(info))

    // Listing doc for dashboard "Your Groups" (SSR list)
    const listing = { id: groupId, name, image: null as string | null }
    await db.set(`groups:${groupId}`, JSON.stringify(listing))

    // Global registry of all groups for discovery
    await db.sadd('groups:all', groupId)

    // Add group to each member's personal set so it shows up in lists
    for (const memberId of groupData.members) {
      await db.sadd(`user:${memberId}:groups`, groupId)
    }

    // Realtime notify each member (clients may subscribe to user:{id}:groups)
    const payload: GroupChat = {
      id: groupId,
      name,
      description: undefined,
      members: groupData.members,
      admins: [session.user.id],
      createdAt: now,
      createdBy: session.user.id,
      avatar: undefined,
    }
    for (const memberId of groupData.members) {
      await pusherServer.trigger(
        toPusherKey(`user:${memberId}:groups`),
        'group_created',
        payload
      )
    }

    return new Response(JSON.stringify(groupData), { status: 200 })
  } catch (error) {
    return new Response('Internal Error', { status: 500 })
  }
}