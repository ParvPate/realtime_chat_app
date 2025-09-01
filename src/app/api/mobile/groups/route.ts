import { getBearerUserId } from '@/lib/mobile-jwt'
import { fetchRedis } from '@/helpers/redis'

type GroupListItem = {
  id: string
  name: string
  membersCount: number
  createdAt?: number
  image?: string | null
}

export async function GET(req: Request) {
  try {
    const userId = getBearerUserId(req)

    const groupIds = (await fetchRedis('smembers', `user:${userId}:groups`)) as string[] | null
    const ids = groupIds ?? []

    const groups: GroupListItem[] = await Promise.all(
      ids.map(async (gid) => {
        // canonical record
        const groupRaw = (await fetchRedis('get', `group:${gid}`)) as string | null
        // listing record (fallback)
        const listRaw = (await fetchRedis('get', `groups:${gid}`)) as string | null

        let name = 'Group'
        let membersCount = 0
        let createdAt: number | undefined = undefined
        let image: string | null | undefined = undefined

        if (groupRaw) {
          try {
            const g = JSON.parse(groupRaw) as { id: string; name: string; members?: string[]; createdAt?: number }
            name = g.name ?? name
            membersCount = Array.isArray(g.members) ? g.members.length : membersCount
            createdAt = typeof g.createdAt === 'number' ? g.createdAt : createdAt
          } catch {
            // ignore parse error
          }
        }
        if (listRaw) {
          try {
            const l = JSON.parse(listRaw) as { id: string; name: string; image?: string | null }
            name = l.name ?? name
            image = l.image ?? image
          } catch {
            // ignore parse error
          }
        }

        return { id: gid, name, membersCount, createdAt, image }
      })
    )

    // sort by createdAt desc when available
    groups.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))

    return new Response(JSON.stringify({ groups }), {
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