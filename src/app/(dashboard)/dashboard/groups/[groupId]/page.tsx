import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { notFound, redirect } from 'next/navigation'
import { fetchRedis } from '@/helpers/redis'
import GroupChat from '@/components/group/GroupChat'
import { GroupInfo, GroupMember, GroupMessage } from '@/types/group'

type Params = { params: Promise<{ groupId: string }> }

export default async function GroupPage({ params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { groupId } = await params

  // Info
  const infoRaw = await fetchRedis('get', `group:${groupId}:info`)
  if (!infoRaw) return notFound()
  const info = (typeof infoRaw === 'string' ? JSON.parse(infoRaw) : infoRaw) as GroupInfo

  // Members
  const memberIds = (await fetchRedis('smembers', `group:${groupId}:members`)) as string[] | null
  if (!memberIds || !memberIds.includes(session.user.id)) return notFound()

  const members: GroupMember[] = await Promise.all(
    memberIds.map(async (id) => {
      const raw = (await fetchRedis('get', `user:${id}`)) as string | null
      if (!raw) return { id, email: 'Unknown' }
      const u = JSON.parse(raw)
      return { id, name: u.name, email: u.email, image: u.image }
    })
  )

  // Messages (assuming zset like your DM flow)
  const msgRaw = (await fetchRedis('zrange', `group:${groupId}:messages`, 0, -1)) as string[] | null
  const initialMessages: GroupMessage[] = (msgRaw ?? []).map((m) => JSON.parse(m))

  return (
    <GroupChat
      groupId={groupId}
      sessionId={session.user.id}
      sessionImg={session.user.image ?? null}
      info={info}
      members={members}
      initialMessages={initialMessages}
    />
  )
}