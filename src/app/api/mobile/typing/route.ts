import { getBearerUserId } from '@/lib/mobile-jwt'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { isGroupChat } from '@/lib/db'

type Body = {
  chatId: string
  isTyping: boolean
}

/**
 * Mobile typing indicator endpoint (Bearer auth).
 * Accepts both 1-1 chatId format "userA--userB" and group format "group:{groupId}".
 * Emits "typing" event to:
 *  - 1-1: channel = chat:{chatId}:typing
 *  - group: channel = group:{groupId}:typing
 */
export async function POST(req: Request) {
  try {
    const userId = getBearerUserId(req)

    const { chatId, isTyping }: Body = await req.json()

    if (!chatId || typeof isTyping !== 'boolean') {
      return new Response('Invalid body', { status: 400 })
    }

    if (isGroupChat(chatId)) {
      const groupId = chatId.replace('group:', '')
      await pusherServer.trigger(
        toPusherKey(`group:${groupId}:typing`),
        'typing',
        { userId, isTyping }
      )
    } else {
      await pusherServer.trigger(
        toPusherKey(`chat:${chatId}:typing`),
        'typing',
        { userId, isTyping }
      )
    }

    return new Response('OK')
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal Server Error'
    const code =
      msg === 'Missing Bearer token' ||
      msg === 'Invalid token signature' ||
      msg === 'Token expired'
        ? 401
        : 500
    return new Response(msg, { status: code })
  }
}