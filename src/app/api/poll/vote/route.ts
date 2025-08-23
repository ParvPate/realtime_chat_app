import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { getServerSession } from 'next-auth'

export async function POST(req: Request) {
  try {
    const { messageId, chatId, optionIds } = await req.json()
    const session = await getServerSession(authOptions)

    if (!session) return new Response('Unauthorized', { status: 401 })

    // Get the message with the poll
    const messages = await db.zrange(`chat:${chatId}:messages`, 0, -1)
    let pollMessage = null
    let messageIndex = -1

    for (let i = 0; i < messages.length; i++) {
      const msg = JSON.parse(messages[i])
      if (msg.id === messageId) {
        pollMessage = msg
        messageIndex = i
        break
      }
    }

    if (!pollMessage || !pollMessage.poll) {
      return new Response('Poll not found', { status: 404 })
    }

    // Update poll votes
    const updatedOptions = pollMessage.poll.options.map(option => {
      // Remove user's previous votes
      const filteredVotes = option.votes.filter(userId => userId !== session.user.id)
      
      // Add new vote if this option was selected
      if (optionIds.includes(option.id)) {
        filteredVotes.push(session.user.id)
      }
      
      return {
        ...option,
        votes: filteredVotes
      }
    })

    const totalVotes = updatedOptions.reduce((sum, option) => sum + option.votes.length, 0)

    const updatedMessage = {
      ...pollMessage,
      poll: {
        ...pollMessage.poll,
        options: updatedOptions,
        totalVotes
      }
    }

    // Update in database
    await db.zrem(`chat:${chatId}:messages`, messages[messageIndex])
    await db.zadd(`chat:${chatId}:messages`, {
      score: pollMessage.timestamp,
      member: JSON.stringify(updatedMessage)
    })

    // Broadcast the updated poll to all clients
    await pusherServer.trigger(
      toPusherKey(`chat:${chatId}`),
      'poll-updated',
      updatedMessage
    )

    return new Response('OK')
  } catch (error) {
    return new Response('Internal Server Error', { status: 500 })
  }
}