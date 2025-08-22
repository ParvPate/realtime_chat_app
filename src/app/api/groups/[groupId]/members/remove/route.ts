import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { GroupChat } from '@/types/db'

export async function POST(req: Request, { params }: { params: { groupId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const { memberId }: { memberId: string } = await req.json()
    const { groupId } = params

    const groupData = await fetchRedis('get', `groups:${groupId}`) as string
    if (!groupData) return new Response('Group not found', { status: 404 })

    const group: GroupChat = JSON.parse(groupData)

    // Check permissions (admin or removing self)
    if (!group.admins.includes(session.user.id) && session.user.id !== memberId) {
      return new Response('Insufficient permissions', { status: 403 })
    }

    // Remove member
    const updatedMembers = group.members.filter(id => id !== memberId)
    const updatedAdmins = group.admins.filter(id => id !== memberId)
    
    const updatedGroup = { 
      ...group, 
      members: updatedMembers,
      admins: updatedAdmins 
    }

    // Update group data
    await db.set(`groups:${groupId}`, JSON.stringify(updatedGroup))

    // Remove group from user's group list
    await db.srem(`user:${memberId}:groups`, groupId)

    // Notify remaining members
    await pusherServer.trigger(
      updatedMembers.map(id => toPusherKey(`user:${id}:groups`)),
      'group_updated',
      updatedGroup
    )

    // Notify removed member
    await pusherServer.trigger(
      toPusherKey(`user:${memberId}:groups`),
      'group_left',
      { groupId }
    )

    return Response.json({ success: true })
  } catch (error) {
    return new Response('Internal Error', { status: 500 })
  }
}