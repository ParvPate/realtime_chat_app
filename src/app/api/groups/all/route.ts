import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchRedis } from '@/helpers/redis'

type GroupListItem = {
  id: string
  name: string
  image?: string | null
  membersCount: number
  createdAt?: number
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    // Global registry of all groups (populated on create)
    const allIds = (await fetchRedis('smembers', 'groups:all')) as string[] | null
    let ids = allIds ?? []

    // Fallback discovery when registry is empty: scan listing and canonical keys
    if (!ids.length) {
      try {
        const scanRes = (await fetchRedis('scan', 0, 'match', 'groups:*', 'count', 1000)) as any
        const listingKeys = Array.isArray(scanRes) ? (scanRes[1] as string[]) : []
        const fromListing = (listingKeys ?? [])
          .map((k: string) => {
            const parts = k.split(':')
            return parts.length >= 2 ? parts[1] : null
          })
          .filter(Boolean) as string[]

        const scanRes2 = (await fetchRedis('scan', 0, 'match', 'group:*', 'count', 1000)) as any
        const canonicalKeys = Array.isArray(scanRes2) ? (scanRes2[1] as string[]) : []
        const fromCanonical = (canonicalKeys ?? [])
          .map((k: string) => {
            const parts = k.split(':')
            // Accept exactly "group:{id}" (2 parts). Skip "group:{id}:members", "group:{id}:info", etc.
            return parts.length === 2 ? parts[1] : null
          })
          .filter(Boolean) as string[]

        const combined = Array.from(new Set<string>([...fromListing, ...fromCanonical]))
        if (combined.length) {
          ids = combined
        }
      } catch {
        // ignore; leave ids empty
      }
    }

    // Current user's memberships (used by caller to highlight)
    const myGroupIds = (await fetchRedis('smembers', `user:${session.user.id}:groups`)) as
      | string[]
      | null
    const mySet = new Set(myGroupIds ?? [])

    const groups: (GroupListItem & { isMember: boolean })[] = await Promise.all(
      ids.map(async (gid) => {
        const [canonical, listing] = (await Promise.all([
          fetchRedis('get', `group:${gid}`) as Promise<string | null>,
          fetchRedis('get', `groups:${gid}`) as Promise<string | null>,
        ])) as [string | null, string | null]

        let name = 'Group'
        let image: string | null | undefined = null
        let membersCount = 0
        let createdAt: number | undefined = undefined

        if (canonical) {
          try {
            const g = JSON.parse(canonical) as { name?: string; members?: string[]; createdAt?: number }
            name = g?.name ?? name
            membersCount = Array.isArray(g?.members) ? g!.members!.length : membersCount
            createdAt = typeof g?.createdAt === 'number' ? g.createdAt : createdAt
          } catch {
            // ignore
          }
        }

        if (listing) {
          try {
            const l = JSON.parse(listing) as { name?: string; image?: string | null }
            name = l?.name ?? name
            image = l?.image ?? image
          } catch {
            // ignore
          }
        }

        return {
          id: gid,
          name,
          image,
          membersCount,
          createdAt,
          isMember: mySet.has(gid),
        }
      })
    )

    // sort by createdAt desc when available
    groups.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))

    return new Response(JSON.stringify({ groups }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response('Internal Error', { status: 500 })
  }
}