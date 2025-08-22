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

    const { groupId } = params

    const groupData = await fetchRedis('get', `groups:${groupId}`) as string
    if (!groupData) return new Response('Group not found', { status: 404 })

    const group: GroupChat = JSON.parse(groupData)

    if (!group.members.includes(session.user.id)) {
      return new Response('Not a member', { status: 400 })
    }

    // Remove user from group
    const updatedMembers = group.members.filter(id => id !== session.user.id)
    const updatedAdmins = group.admins.filter(id => id !== session.user.id)

    // If last member, delete group
    if (updatedMembers.length === 0) {
      await db.del(`groups:${groupId}`)
      await db.del(`chat:group:${groupId}:messages`)
    } else {
      // If last admin, make someone else admin
      if (updatedAdmins.length === 0 && updatedMembers.length > 0) {
        updatedAdmins.push(updatedMembers[0])
      }

      const updatedGroup = { 
        ...group, 
        members: updatedMembers,
        admins: updatedAdmins 
      }

      await db.set(`groups:${groupId}`, JSON.stringify(updatedGroup))

      // Notify remaining members
      await pusherServer.trigger(
        updatedMembers.map(id => toPusherKey(`user:${id}:groups`)),
        'group_updated',
        updatedGroup
      )
    }

    // Remove group from user's list
    await db.srem(`user:${session.user.id}:groups`, groupId)

    return Response.json({ success: true })
  } catch (error) {
    return new Response('Internal Error', { status: 500 })
  }
}