import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { chatHrefConstructor } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'
import { getServerSession } from 'next-auth'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Message, User } from '@/types/db'
import GroupDiscoveryList from '@/components/GroupDiscoveryList'
import { db } from '@/lib/db'

type DiscoverGroup = {
  id: string
  name: string
  image?: string | null
  membersCount: number
  isMember: boolean
  createdAt?: number
}

const page = async ({}) => {
  const session = await getServerSession(authOptions)
  if (!session) notFound()

  // Recent chats (friends with last message)
  const friendIds = (await fetchRedis('smembers', `user:${session.user.id}:friends`)) as string[]

  const friends = await Promise.all(
    friendIds.map(async (id): Promise<User> => {
      const raw = await fetchRedis('get', `user:${id}`)
      return JSON.parse(raw as string) as User
    })
  )

  const friendsWithLastMessage = await Promise.all(
    friends.map(async (friend) => {
      const [lastMessageRaw] = (await fetchRedis(
        'zrange',
        `chat:${chatHrefConstructor(session.user.id, friend.id)}:messages`,
        -1,
        -1
      )) as string[]

      const lastMessage = lastMessageRaw ? (JSON.parse(lastMessageRaw) as Message) : null

      return {
        ...friend,
        lastMessage,
      }
    })
  )

  // Groups list omitted on dashboard (shown in sidebar)
  // All group chats (global discovery) with membership highlight
  async function getAllGroupsForDiscovery(userId: string): Promise<DiscoverGroup[]> {
    // 1) Try global registry
    const allIds = (await fetchRedis('smembers', 'groups:all')) as string[] | null
    let ids = allIds ?? []

    // 2) Fallback/backfill from this user's memberships
    if (!ids.length) {
      const myGroups = (await fetchRedis('smembers', `user:${userId}:groups`)) as string[] | null
      const fallbackIds = myGroups ?? []
      if (fallbackIds.length) {
        try {
          for (const gid of fallbackIds) {
            try {
              await db.sadd('groups:all', gid)
            } catch {}
          }
        } catch {}
        ids = fallbackIds
      }
    }

    // 3) Deep fallback: discover from listing keys "groups:{id}"
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
        if (fromListing.length) {
          ids = fromListing
        }
      } catch {}
    }

    // 4) Deepest fallback: discover from canonical keys "group:{id}" (skip "group:{id}:*")
    if (!ids.length) {
      try {
        const scanRes2 = (await fetchRedis('scan', 0, 'match', 'group:*', 'count', 1000)) as any
        const canonicalKeys = Array.isArray(scanRes2) ? (scanRes2[1] as string[]) : []
        const fromCanonical = (canonicalKeys ?? [])
          .map((k: string) => {
            const parts = k.split(':')
            return parts.length === 2 ? parts[1] : null
          })
          .filter(Boolean) as string[]
        if (fromCanonical.length) {
          ids = fromCanonical
        }
      } catch {}
    }

    // Compute isMember based on current user set
    const myGroupIds = (await fetchRedis('smembers', `user:${userId}:groups`)) as string[] | null
    const mySet = new Set(myGroupIds ?? [])

    const groupsAll: DiscoverGroup[] = await Promise.all(
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
            membersCount = Array.isArray(g?.members) ? g.members!.length : membersCount
            createdAt = typeof g?.createdAt === 'number' ? g.createdAt : createdAt
          } catch {}
        }

        if (listing) {
          try {
            const l = JSON.parse(listing) as { name?: string; image?: string | null }
            name = l?.name ?? name
            image = l?.image ?? image
          } catch {}
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

    // Sort newest first when available
    groupsAll.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    return groupsAll
  }

  const allGroups = await getAllGroupsForDiscovery(session.user.id)

  return (
    <div className="container py-12">
      <h1 className="font-bold text-5xl mb-8">Recent chats</h1>
      {friendsWithLastMessage.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing to show here...</p>
      ) : (
        friendsWithLastMessage.map((friend) => (
          <div key={friend.id} className="relative bg-zinc-50 border border-zinc-200 p-3 rounded-md">
            <div className="absolute right-4 inset-y-0 flex items-center">
              <ChevronRight className="h-7 w-7 text-zinc-400" />
            </div>

            <Link
              href={`/dashboard/chat/${chatHrefConstructor(session.user.id, friend.id)}`}
              className="relative sm:flex"
            >
              <div className="mb-4 flex-shrink-0 sm:mb-0 sm:mr-4">
                <div className="relative h-6 w-6">
                  <Image
                    referrerPolicy="no-referrer"
                    className="rounded-full"
                    alt={`${friend.name} profile picture`}
                    src={friend.image}
                    fill
                  />
                </div>
              </div>

              <div>
                <h4 className="text-lg font-semibold">{friend.name}</h4>
                <p className="mt-1 max-w-md">
                  <span className="text-zinc-400">{friend.lastMessage?.senderId === session.user.id ? 'You: ' : ''}</span>
                  {friend.lastMessage?.text}
                </p>
              </div>
            </Link>
          </div>
        ))
      )}

      {/* Your Groups section removed as per user request */}

      <h2 className="font-bold text-3xl mt-8 mb-4">All Group Chats</h2>
      {allGroups.length === 0 ? (
        <p className="text-sm text-zinc-500">No groups have been created yet.</p>
      ) : (
        <GroupDiscoveryList groups={allGroups} />
      )}
    </div>
  )
}

export default page
