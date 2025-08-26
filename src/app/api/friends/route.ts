import { authOptions } from "@/lib/auth"
import { getServerSession } from "next-auth"
import { fetchRedis } from "@/helpers/redis"

// GET /api/friends
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return new Response("Unauthorized", { status: 401 })
  }

  try {
    // This mimics getFriendsByUserId(session.user.id)
    const friendIds = await fetchRedis(
      "smembers",
      `user:${session.user.id}:friends`
    )

    const friends = await Promise.all(
      friendIds.map(async (friendId: string) => {
        const friend = await fetchRedis("get", `user:${friendId}`)
        return JSON.parse(friend)
      })
    )

    return new Response(JSON.stringify(friends), { status: 200 })
  } catch (err) {
    return new Response("Internal Server Error", { status: 500 })
  }
}