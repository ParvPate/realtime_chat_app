import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { db, isGroupChat } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { Message, messageValidator } from '@/lib/validations/message'
import { GroupChat, User } from '@/types/db'
import { nanoid } from 'nanoid'
import { getServerSession } from 'next-auth'

export async function POST(req: Request) {
  try {
  
   

    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const { text, chatId } = await req.json()

    let recipients: string[] = []

     if (isGroupChat(chatId)) {
      // Get group members

      const groupData = await db.get<string>(`groups:${chatId.replace("group:", "")}`);
      if (!groupData) return new Response("Group not found", { status: 404 });

      const group: GroupChat = JSON.parse(groupData);
      recipients = group.members;
    }else {
      

      const { text, chatId }: { text: string; chatId: string } = await req.json()
      const session = await getServerSession(authOptions)

      if (!session) return new Response('Unauthorized', { status: 401 })

      const [userId1, userId2] = chatId.split('--')
      if (session.user.id !== userId1 && session.user.id !== userId2) {
        return new Response('Unauthorized', { status: 401 })
      }

      const friendId = session.user.id === userId1 ? userId2 : userId1

      const friendList = (await fetchRedis(
        'smembers',
        `user:${session.user.id}:friends`
      )) as string[]
      const isFriend = friendList.includes(friendId)

      if (!isFriend) {
        return new Response('Unauthorized', { status: 401 })
      }

      const rawSender = (await fetchRedis(
        'get',
        `user:${session.user.id}`
      )) as string
      const sender = JSON.parse(rawSender) as User


      const chatPartner = session.user.id === userId1 ? userId1 : userId2

      recipients = [session.user.id, chatPartner]
      

      const timestamp = Date.now()
      const messageData: Message = {
        id: nanoid(),
        senderId: session.user.id,
        text,
        timestamp,
      }

      const message = messageValidator.parse(messageData)

      // notify all connected chat room clients
      await pusherServer.trigger(toPusherKey(`chat:${chatId}`), 'incoming-message', message)

      await pusherServer.trigger(toPusherKey(`user:${friendId}:chats`), 'new_message', {
        ...message,
        senderImg: sender.image,
        senderName: sender.name
      })

      // all valid, send the message
      await db.zadd(`chat:${chatId}:messages`, {
        score: timestamp,
        member: JSON.stringify(message),
      })
      recipients = [session.user.id, chatPartner]
      return new Response('OK')
      
    }

    const message: Message = {
      id: nanoid(),
      senderId: session.user.id,
      text,
      timestamp: Date.now(),
    }

    // Store message
    await db.zadd(`messages:${chatId}`, {
      score: Date.now(),
      member: JSON.stringify(message),
    })

    // Trigger real-time update for all recipients
    await pusherServer.trigger(
      recipients.map(id => `user:${id}:chats`),
      'new_message',
      message
    )

    return Response.json({ success: true })

  } catch (error) {
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 })
    }

    return new Response('Internal Server Error', { status: 500 })
  }
}
