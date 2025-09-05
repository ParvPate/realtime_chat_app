import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { notFound } from 'next/navigation'
import { fetchRedis } from '@/helpers/redis'
import GroupJoinRequests from '@/components/GroupJoinRequests'

type RequestItem = {
  groupId: string
  requesterId: string
  requesterEmail?: string
  requestedAt: number
  groupName?: string
}

const Page = async () => {
  const session = await getServerSession(authOptions)
  if (!session) notFound()

  const raw = (await fetchRedis('smembers', `user:${session.user.id}:group_join_requests`)) as
    | string[]
    | null

  const items: RequestItem[] = (raw ?? [])
    .map((s) => {
      try {
        return JSON.parse(s) as RequestItem
      } catch {
        return null
      }
    })
    .filter(Boolean) as RequestItem[]

  // Sort newest first
  items.sort((a, b) => (b.requestedAt ?? 0) - (a.requestedAt ?? 0))

  return (
    <div className="container py-12">
      <h1 className="font-bold text-3xl mb-4">Group Chat Entry Requests</h1>
      <GroupJoinRequests initialRequests={items} sessionUserId={session.user.id} />
    </div>
  )
}

export default Page