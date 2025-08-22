import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { nanoid } from 'nanoid'
import { GroupChat } from '@/types/db'

export async function POST(req: Request) {
  try {
    /*
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const { name, description, members } = await req.json()
    
    // Validate input
    if (!name || !members || members.length < 2) {
      return new Response('Invalid group data', { status: 400 })
    }
    if (!Array.isArray(members) || members.length === 0) {
      return new Response('At least one member is required', { status: 400 })
    }

    // Sanitize inputs
    const sanitizedName = name.trim().slice(0, 50)
    const sanitizedDescription = description?.trim().slice(0, 200) || ''
    const validMembers = members.filter(id => typeof id === 'string' && id.length > 0)

    if (validMembers.length === 0) {
      return new Response('No valid members provided', { status: 400 })
    }

    const groupId = nanoid()
    const group: GroupChat = {
      id: groupId,
      name,
      description,
      members: [session.user.id, ...members],
      admins: [session.user.id],
      createdAt: Date.now(),
      createdBy: session.user.id
    }

    // Store group data
    await db.set(`groups:${groupId}`, JSON.stringify(group))
    
    // Add group to each member's group list
    for (const memberId of group.members) {
      await db.sadd(`user:${memberId}:groups`, groupId)
    }

    // Notify all members
    await pusherServer.trigger(
      group.members.map(id => `user:${id}:groups`),
      'group_created',
      group
    )

    return Response.json({ group })
    */
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const { name, members } = await req.json()

    if (!name || !Array.isArray(members) || members.length < 2) {
      return new Response('Invalid group data', { status: 400 })
    }

    const groupId = nanoid()
    const groupKey = `group:${groupId}`

    const groupData = {
      id: groupId,
      name,
      admin: session.user.id,
      members: [session.user.id, ...members],
      createdAt: Date.now(),
    }

    await db.set(groupKey, JSON.stringify(groupData))
    await db.sadd(`${groupKey}:members`, session.user.id, ...members)

    return new Response(JSON.stringify(groupData), { status: 200 })
  } catch (error) {
    return new Response('Internal Error', { status: 500 })
  }
}