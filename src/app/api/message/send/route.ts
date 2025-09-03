import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { db, isGroupChat } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { Message, messageValidator } from '@/lib/validations/message'
import { User } from '@/types/db'
import { nanoid } from 'nanoid'
import { getServerSession } from 'next-auth'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const body = await req.json().catch(() => ({} as any))
    const chatId = typeof body?.chatId === 'string' ? body.chatId : ''
    const rawText = typeof body?.text === 'string' ? body.text : ''
    const text = rawText?.trim?.() ?? ''
    const image = typeof body?.image === 'string' ? body.image : undefined
    // minimal diagnostics (avoid logging actual image)
    console.debug('[api/message/send] parsed body', {
      chatId,
      textLength: text.length,
      imageLength: image?.length ?? 0,
    })

    if (!chatId || (!text && !image)) {
      return new Response('Invalid body', { status: 400 })
    }

    // Guard against oversized payloads (approx 1MB JSON limit)
    const MAX_IMAGE_CHARS = 1_000_000
    if (image && image.length > MAX_IMAGE_CHARS) {
      return new Response('Image too large', { status: 413 })
    }

    // If image is a data URL, persist the raw data separately and replace with a small internal URL.
    // This avoids exceeding Pusher payload limits (~10KB) and large event bodies.
    let messageImage: string | undefined = image
    if (typeof image === 'string' && image.startsWith('data:image/')) {
      try {
        const commaIdx = image.indexOf(',')
        if (commaIdx > -1) {
          const meta = image.slice(5, commaIdx) // e.g. "image/png;base64"
          const mime = meta.split(';')[0] // "image/png"
          const base64 = image.slice(commaIdx + 1)
          const imgId = nanoid()
          await db.set(`image:${imgId}`, JSON.stringify({ mime, data: base64 }))
          messageImage = `/api/images/${imgId}`
        }
      } catch (e) {
        console.error('[api/message/send] failed to persist image data', e)
        return new Response('Failed to persist image', { status: 500 })
      }
    }

    const timestamp = Date.now()

    // GROUP CHAT
    if (isGroupChat(chatId)) {
      const groupId = chatId.replace('group:', '')

      // Validate that the user is a member of the group
      const members = (await fetchRedis('smembers', `group:${groupId}:members`)) as string[] | null
      if (!members || !members.includes(session.user.id)) {
        return new Response('Unauthorized', { status: 401 })
      }

      const messageData: Message = {
        id: nanoid(),
        senderId: session.user.id,
        text: text || '',
        image: messageImage,
        timestamp,
      }
      let message: Message
      try {
        message = messageValidator.parse(messageData)
      } catch (e) {
        console.error('[api/message/send] validation error (group)', e)
        return new Response('Invalid message', { status: 400 })
      }

      // Persist
      await db.zadd(`group:${groupId}:messages`, {
        score: timestamp,
        member: JSON.stringify(message),
      })

      // Realtime for group
      await pusherServer.trigger(toPusherKey(`group:${groupId}`), 'incoming_message', message)

      return new Response('OK')
    }

    // 1-1 CHAT
    const [userId1, userId2] = chatId.split('--')
    if (session.user.id !== userId1 && session.user.id !== userId2) {
      return new Response('Unauthorized', { status: 401 })
    }

    const friendId = session.user.id === userId1 ? userId2 : userId1

    // Ensure friendship
    const friendList = (await fetchRedis('smembers', `user:${session.user.id}:friends`)) as string[] | null
    const isFriend = !!friendList?.includes(friendId)
    if (!isFriend) {
      return new Response('Unauthorized', { status: 401 })
    }

    const messageData: Message = {
      id: nanoid(),
      senderId: session.user.id,
      text: text || '',
      image: messageImage,
      timestamp,
    }
    let message: Message
    try {
      message = messageValidator.parse(messageData)
    } catch (e) {
      console.error('[api/message/send] validation error (dm)', e)
      return new Response('Invalid message', { status: 400 })
    }

    // Realtime to the chat room
    await pusherServer.trigger(toPusherKey(`chat:${chatId}`), 'incoming-message', message)

    // Notify chat list of friend
    const rawSender = (await fetchRedis('get', `user:${session.user.id}`)) as string
    const sender = JSON.parse(rawSender) as User
    await pusherServer.trigger(toPusherKey(`user:${friendId}:chats`), 'new_message', {
      ...message,
      senderImg: sender.image,
      senderName: sender.name,
    })

    // Persist
    await db.zadd(`chat:${chatId}:messages`, {
      score: timestamp,
      member: JSON.stringify(message),
    })

    return new Response('OK')
  } catch (error) {
    console.error('[api/message/send] error', error)
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 })
    }
    return new Response('Internal Server Error', { status: 500 })
  }
}
