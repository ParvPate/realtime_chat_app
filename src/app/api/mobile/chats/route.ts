import { getBearerUserId } from '@/lib/mobile-jwt'
import { fetchRedis } from '@/helpers/redis'
import { chatHrefConstructor } from '@/lib/utils'
import type { Message, User } from '@/types/db'

type ChatListItem = {
  chatId: string
  partner: {
    id: string
    name: string
    email: string
    image?: string | null
  }
  lastMessage: Message | null
}

export async function GET(req: Request) {
  try {
    const userId = getBearerUserId(req)

    // Load friend ids
    const friendIds = (await fetchRedis('smembers', `user:${userId}:friends`)) as string[] | null
    const ids = friendIds ?? []

    // Build chat list with last message
    const items: ChatListItem[] = await Promise.all(
      ids.map(async (fid) => {
        // partner info
        const rawPartner = (await fetchRedis('get', `user:${fid}`)) as string | null
        const partner: User | null = rawPartner ? JSON.parse(rawPartner) : null

        // last message in zset
        const chatId = chatHrefConstructor(userId, fid)
        const [lastMessageRaw] = ((await fetchRedis(
          'zrange',
          `chat:${chatId}:messages`,
          -1,
          -1
        )) as string[] | null) ?? []
        const lastMessage = lastMessageRaw ? (JSON.parse(lastMessageRaw) as Message) : null

        return {
          chatId,
          partner: {
            id: partner?.id ?? fid,
            name: partner?.name ?? 'Unknown',
            email: partner?.email ?? 'unknown@example.com',
            image: partner?.image,
          },
          lastMessage,
        }
      })
    )

    // Sort by lastMessage timestamp desc (nulls last)
    items.sort((a, b) => {
      const at = a.lastMessage?.timestamp ?? 0
      const bt = b.lastMessage?.timestamp ?? 0
      return bt - at
    })

    return new Response(JSON.stringify({ chats: items }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
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