import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { fetchRedis } from "@/helpers/redis"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response("Unauthorized", { status: 401 })

  const chatIds = await fetchRedis("smembers", `user:${session.user.id}:chats`)

  const chats = await Promise.all(
    chatIds.map(async (chatId: string) => {
      const chat = await fetchRedis("get", `chat:${chatId}`)
      return JSON.parse(chat)
    })
  )

  return Response.json(chats)
}
