import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { fetchRedis } from "@/helpers/redis"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response("Unauthorized", { status: 401 })

  const incomingSenderIds = await fetchRedis(
    "smembers",
    `user:${session.user.id}:incoming_friend_requests`
  )

  const requests = await Promise.all(
    incomingSenderIds.map(async (senderId: string) => {
      const sender = await fetchRedis("get", `user:${senderId}`)
      const senderParsed = JSON.parse(sender)
      return {
        senderId,
        senderEmail: senderParsed.email,
        senderName: senderParsed.name,
        senderImage: senderParsed.image,
      }
    })
  )

  return Response.json(requests)
}
