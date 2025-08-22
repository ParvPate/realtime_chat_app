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

    // Get group data
    const groupData = await fetchRedis('get', `groups:${groupId}`) as string
    if (!groupData) return new Response('Group not found', { status: 404 })

    const group: GroupChat = JSON.parse(groupData)

    // Check if user is admin
    if (!group.admins.includes(session.user.id)) {
      return new Response('Only admins can add members', { status: 403 })
    }

    // Add new members
    const updatedMembers = [...new Set([...group.members, ...memberIds])]
    const updatedGroup = { ...group, members: updatedMembers }

    // Update group data
    await db.set(`groups:${groupId}`, JSON.stringify(updatedGroup))

    // Add group to new members' group lists
    for (const memberId of memberIds) {
      if (!group.members.includes(memberId)) {
        await db.sadd(`user:${memberId}:groups`, groupId)
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