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

    const { name, description }: { name: string; description?: string } = await req.json()
    const { groupId } = params

    // Validate input
    if (!name || name.trim().length === 0) {
      return new Response('Group name is required', { status: 400 })
    }

    // Sanitize input
    const sanitizedName = name.trim().slice(0, 50) // Limit length
    const sanitizedDescription = description?.trim().slice(0, 200) || ''

    const groupData = await fetchRedis('get', `groups:${groupId}`) as string
    if (!groupData) return new Response('Group not found', { status: 404 })

    const group: GroupChat = JSON.parse(groupData)

    // Check if user is admin
    if (!group.admins.includes(session.user.id)) {
      return new Response('Only admins can update group', { status: 403 })
    }

    const updatedGroup = {
      ...group,
      name: sanitizedName,
      description: sanitizedDescription
    }

    // Update group data
    await db.set(`groups:${groupId}`, JSON.stringify(updatedGroup))

    // Notify all members
    await pusherServer.trigger(
      group.members.map(id => toPusherKey(`user:${id}:groups`)),
      'group_updated',
      updatedGroup
    )

    return Response.json({ success: true })
  } catch (error) {
    return new Response('Internal Error', { status: 500 })
  }
}