import { getBearerUserId } from '@/lib/mobile-jwt'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { nanoid } from 'nanoid'
import type { GroupChat } from '@/types/db'

type Body = {
  name: string
  memberIds: string[] // friend user IDs
  description?: string
}

/**
 * Mobile: create a new group.
 * Requirements:
 *  - name: non-empty
 *  - memberIds: at least 2 friend IDs (so group size >= 3 including creator)
 * Behavior:
 *  - creator becomes admin
 *  - canonical doc saved at group:{id}
 *  - listing doc saved at groups:{id}
 *  - members set saved at group:{id}:members
 *  - groupId added to each user's user:{id}:groups set
 *  - pusher: group_created on user:{id}:groups for each member
 */
export async function POST(req: Request) {
  try {
    const userId = getBearerUserId(req)

    const body = (await req.json().catch(() => ({}))) as Partial<Body>
    const name = String(body?.name ?? '').trim()
    const provided = Array.isArray(body?.memberIds) ? body!.memberIds : []
    const description = typeof body?.description === 'string' ? body.description.trim() : undefined

    if (!name) return new Response('Invalid group name', { status: 400 })

    // at least 2 friends (so total participants >= 3 including creator)
    const memberIds = [...new Set(provided.map((s) => String(s ?? '').trim()).filter(Boolean))]
    if (memberIds.length < 2) {
      return new Response('At least 2 friends are required', { status: 400 })
    }

    // Validate that provided members are actually friends of the creator
    const friendIds = (await fetchRedis('smembers', `user:${userId}:friends`)) as string[] | null
    const friendsSet = new Set(friendIds ?? [])
    const filtered = memberIds.filter((id) => friendsSet.has(id) && id !== userId)

    if (filtered.length < 2) {
      return new Response('Members must be your friends (min 2)', { status: 400 })
    }

    const now = Date.now()
    const groupId = nanoid()
    const groupKey = `group:${groupId}`

    const allMembers = [userId, ...filtered]

    const groupData: GroupChat = {
      id: groupId,
      name,
      description,
      members: allMembers,
      admins: [userId],
      createdAt: now,
      createdBy: userId,
      avatar: undefined,
    }

    // Persist canonical
    await db.set(groupKey, JSON.stringify(groupData))
    // Members set (add individually for type compatibility)
    for (const id of allMembers) {
      await db.sadd(`${groupKey}:members`, id)
    }

    // Info doc used by some SSR paths (optional legacy compatibility)
    const info = {
      id: groupId,
      name,
      createdBy: userId,
      createdAt: now,
    }
    await db.set(`group:${groupId}:info`, JSON.stringify(info))

    // Listing doc for dashboards
    const listing = { id: groupId, name, image: null as string | null }
    await db.set(`groups:${groupId}`, JSON.stringify(listing))

    // Add group to each member
    for (const id of allMembers) {
      await db.sadd(`user:${id}:groups`, groupId)
    }

    // Realtime notify each member
    for (const id of allMembers) {
      await pusherServer.trigger(toPusherKey(`user:${id}:groups`), 'group_created', groupData)
    }

    return new Response(JSON.stringify(groupData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
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