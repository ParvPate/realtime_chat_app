import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { isGroupChat } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const { chatId, isTyping }: { chatId: string; isTyping: boolean } = await req.json()

    // Trigger typing indicator
    await pusherServer.trigger(
      toPusherKey(`chat:${chatId}:typing`),
      'typing',
      {
        userId: session.user.id,
        isTyping
      }
    )

    return new Response('OK')
  } catch (error) {
    return new Response('Internal Error', { status: 500 })
  }
}