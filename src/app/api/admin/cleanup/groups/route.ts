import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { fetchRedis } from '@/helpers/redis'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'

async function deleteGroupAndBroadcast(groupId: string, members: string[]) {
  // Delete both canonical and legacy keys
  await db.del(`groups:${groupId}`)
  await db.del(`group:${groupId}`)
  await db.del(`group:${groupId}:info`)
  await db.del(`group:${groupId}:members`)
  await db.del(`group:${groupId}:messages`)
  await db.del(`chat:group:${groupId}:messages`) // legacy

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

async function getMembersForGroup(groupId: string): Promise<string[]> {
  // Try canonical group doc first
  const raw = await db.get(`group:${groupId}`)
  if (raw) {
    try {
      const g = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (Array.isArray(g?.members)) return g.members as string[]
    } catch {
      // ignore
    }
  }

  // Fallback to members set
  const setMembers = (await fetchRedis('smembers', `group:${groupId}:members`)) as string[] | null
  return Array.isArray(setMembers) ? setMembers : []
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    // Optional gate: require explicit confirmation via query (?confirm=1)
    const url = new URL(req.url)
    const confirm = url.searchParams.get('confirm')
    if (confirm !== '1') {
      return new Response('Confirmation required. Re-run with ?confirm=1', { status: 400 })
    }

    // Find all group listing keys and evaluate each group
    // Note: KEYS is fine for admin/maintenance; avoid in hot paths.
    const listKeys = (await (db as any).keys?.('groups:*')) as string[] | undefined
    if (!listKeys || listKeys.length === 0) {
      return new Response(JSON.stringify({ deleted: [], checked: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const deleted: string[] = []
    let checked = 0

    for (const key of listKeys) {
      // key format: "groups:{groupId}"
      const parts = key.split(':')
      const groupId = parts[1]
      if (!groupId) continue

      const members = await getMembersForGroup(groupId)
      checked++

      if (members.length < 3) {
        await deleteGroupAndBroadcast(groupId, members)
        deleted.push(groupId)
      }
    }

    return new Response(JSON.stringify({ deleted, checked }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(err?.message || 'Internal Error', { status: 500 })
  }
}