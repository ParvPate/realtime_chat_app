import { authOptions } from "@/lib/auth"
import { getServerSession } from "next-auth"
import { fetchRedis } from "@/helpers/redis"

export async function GET(
  req: Request,
  { params }: { params: { chatId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return new Response("Unauthorized", { status: 401 })
  }

  try {
    // fetch messages from Redis sorted set
    const rawMessages = await fetchRedis(
      "zrange",
      `chat:${params.chatId}:messages`,
      0,
      -1
    )

    const messages = rawMessages.map((m: string) => JSON.parse(m))
    return new Response(JSON.stringify(messages), { status: 200 })
  } catch (err) {
    return new Response("Internal Server Error", { status: 500 })
  }
}