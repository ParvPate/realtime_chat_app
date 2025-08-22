import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { addFriendValidator } from '@/lib/validations/add-friend'
import { getServerSession } from 'next-auth'
import { z } from 'zod'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    
    // Debug logging to see what we're receiving
    console.log('=== DEBUG REQUEST ===')
    console.log('Full body:', JSON.stringify(body, null, 2))
    console.log('Body.email type:', typeof body.email)
    console.log('Body.email value:', body.email)
    console.log('==================')

    console.log('Step 1: Parsing body...')
    const { email: emailToAdd } = addFriendValidator.parse(body)
    console.log('Step 1: ✓ Body parsed successfully')

    console.log('Step 2: Looking up user by email...')
    const idToAdd = (await fetchRedis(
      'get',
      `user:email:${emailToAdd}`
    )) as string
    console.log('Step 2: ✓ User lookup completed, idToAdd:', idToAdd)

    if (!idToAdd) {
      return new Response('This person does not exist.', { status: 400 })
    }

    console.log('Step 3: Getting session...')
    const session = await getServerSession(authOptions)
    console.log('Step 3: ✓ Session retrieved, user ID:', session?.user?.id)

    if (!session) {
      return new Response('Unauthorized', { status: 401 })
    }

    if (idToAdd === session.user.id) {
      return new Response('You cannot add yourself as a friend', {
        status: 400,
      })
    }

    console.log('Step 4: Checking if already added...')
    // check if user is already added
    const isAlreadyAdded = (await fetchRedis(
      'sismember',
      `user:${idToAdd}:incoming_friend_requests`,
      session.user.id
    )) as 0 | 1
    console.log('Step 4: ✓ Already added check completed:', isAlreadyAdded)

    if (isAlreadyAdded) {
      return new Response('Already added this user', { status: 400 })
    }

    console.log('Step 5: Checking if already friends...')
    // check if user is already friends
    const isAlreadyFriends = (await fetchRedis(
      'sismember',
      `user:${session.user.id}:friends`,
      idToAdd
    )) as 0 | 1
    console.log('Step 5: ✓ Already friends check completed:', isAlreadyFriends)

    if (isAlreadyFriends) {
      return new Response('Already friends with this user', { status: 400 })
    }

    console.log('Step 6: Sending Pusher notification...')
    // valid request, send friend request
    await pusherServer.trigger(
      toPusherKey(`user:${idToAdd}:incoming_friend_requests`),
      'incoming_friend_requests',
      {
        senderId: session.user.id,
        senderEmail: session.user.email,
      }
    )
    console.log('Step 6: ✓ Pusher notification sent')

    console.log('Step 7: Adding to Redis...')
    await db.sadd(`user:${idToAdd}:incoming_friend_requests`, session.user.id)
    console.log('Step 7: ✓ Added to Redis')

    return new Response('OK')
  } catch (error: any) {
    console.log('=== ERROR DEBUG ===')
    console.log('Error type:', typeof error)
    console.log('Error name:', error?.constructor?.name)
    console.log('Error message:', error?.message)
    
    if (error instanceof z.ZodError) {
      console.log('Zod validation errors:', error.issues)
      return new Response(`Validation failed: ${JSON.stringify(error.issues)}`, { status: 422 })
    }

    console.log('Full error object:', error)
    return new Response(`Invalid request: ${error?.message || 'Unknown error'}`, { status: 400 })
  }
}