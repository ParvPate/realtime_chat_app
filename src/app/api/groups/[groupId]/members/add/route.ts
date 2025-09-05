import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { GroupChat, User } from '@/types/db'

export async function POST(req: Request, { params }: { params: { groupId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const { memberIds }: { memberIds: string[] } = await req.json()
    const { groupId } = params

    // Load canonical group; fallback to legacy info + member set if needed
    let canonicalStr = (await fetchRedis('get', `group:${groupId}`)) as string | null
    let group: GroupChat

    if (canonicalStr) {
      // Coerce legacy shape: some older groups stored a single "admin" instead of "admins"
      const raw = JSON.parse(canonicalStr) as any
      group = {
        id: raw?.id ?? groupId,
        name: raw?.name ?? '',
        description: raw?.description ?? undefined,
        members: Array.isArray(raw?.members) ? raw.members : [],
        admins: Array.isArray(raw?.admins) ? raw.admins : (raw?.admin ? [raw.admin] : []),
        createdAt: typeof raw?.createdAt === 'number' ? raw.createdAt : Date.now(),
        createdBy: raw?.createdBy ?? (Array.isArray(raw?.admins) && raw.admins[0]) ?? raw?.admin ?? '',
        avatar: raw?.avatar ?? undefined,
      } as GroupChat
    } else {
      const infoRaw = (await fetchRedis('get', `group:${groupId}:info`)) as string | null
      const memberSet = (await fetchRedis('smembers', `group:${groupId}:members`)) as string[] | null
      if (!infoRaw || !memberSet) return new Response('Group not found', { status: 404 })
      const info = JSON.parse(infoRaw) as any
      group = {
        id: groupId,
        name: info?.name ?? 'Group',
        description: undefined,
        members: memberSet,
        admins: info?.createdBy ? [info.createdBy] : [],
        createdAt: typeof info?.createdAt === 'number' ? info.createdAt : Date.now(),
        createdBy: info?.createdBy ?? '',
        avatar: undefined,
      }
    }

    // Resolve effective admins including legacy createdBy; if none, allow any member as legacy fall-back
    const effectiveAdmins =
      Array.isArray(group.admins) && group.admins.length > 0
        ? group.admins
        : (group.createdBy ? [group.createdBy] : [])
    const isAllowed =
      effectiveAdmins.length > 0
        ? effectiveAdmins.includes(session.user.id)
        : Array.isArray(group.members) && group.members.includes(session.user.id)

    if (!isAllowed) {
      return new Response('Only admins can add members', { status: 403 })
    }

    // Add new members
    const updatedMembers = [...new Set([...group.members, ...memberIds])]
    const updatedGroup = { ...group, members: updatedMembers }

    // Update group data (canonical)
    await db.set(`group:${groupId}`, JSON.stringify(updatedGroup))

    // Add group to new members' group lists and sync group members set used by auth checks
    for (const memberId of memberIds) {
      if (!group.members.includes(memberId)) {
        await db.sadd(`user:${memberId}:groups`, groupId)
        await db.sadd(`group:${groupId}:members`, memberId)
      }
    }

    // Notify all members
    await pusherServer.trigger(
      updatedMembers.map(id => toPusherKey(`user:${id}:groups`)),
      'group_updated',
      updatedGroup
    )

    return Response.json({ success: true })
  } catch (error) {
    return new Response('Internal Error', { status: 500 })
  }
}