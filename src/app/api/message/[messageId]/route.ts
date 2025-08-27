import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { pusherServer } from "@/lib/pusher"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { messageValidator } from "@/lib/validations/message"


export async function DELETE(
  req: Request,
  { params }: { params: { messageId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const { messageId } = params

    // Get all chats this user is part of (you may already have this logic)
    // For simplicity, assume you know the chatId from the client
    const { searchParams } = new URL(req.url)
    const chatId = searchParams.get("chatId")

    if (!chatId) {
      return new NextResponse("Chat ID missing", { status: 400 })
    }

    // Get all messages in this chat
    
    const messages = (await db.zrange(`chat:${chatId}:messages`, 0, -1)) as string[]
    let messageToDelete: string | null = null

    for (const raw of messages as string[]) {
      const parsed = JSON.parse(raw)
      const msg = messageValidator.parse(parsed)
      if (msg.id === messageId) {
        // Only allow the sender to delete their own message
        if (msg.senderId !== session.user.id) {
          return new NextResponse("Forbidden", { status: 403 })
        }
        messageToDelete = raw
        break
      }
    }

    if (!messageToDelete) {
      return new NextResponse("Message not found", { status: 404 })
    }

    // Remove message from Redis
    await db.zrem(`chat:${chatId}:messages`, messageToDelete)

    // Notify all clients via Pusher
    await pusherServer.trigger(chatId, "message-deleted", {
      messageId,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting message:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
