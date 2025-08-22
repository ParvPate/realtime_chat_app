'use client'

//import { MessagesProps } from "@/types/index"
import { pusherClient } from '@/lib/pusher'
import { cn, toPusherKey } from '@/lib/utils'
import { Message } from '@/lib/validations/message'
import { User } from '@/types/db'
import { format } from 'date-fns'
import Image from 'next/image'
import { FC, useEffect, useRef, useState } from 'react'

interface MessagesProps {
  initialMessages: Message[]
  sessionId: string
  chatId: string
  sessionImg: string | null | undefined
  chatPartner: User | null
  isGroup: boolean
}
export interface PollOption {
  id: string
  text: string
  votes: string[] 
}

export interface PollData {
  question: string
  options: PollOption[]
  totalVotes: number
  allowMultipleVotes: boolean
}


const Messages: FC<MessagesProps> = ({
  initialMessages,
  sessionId,
  chatId,
  chatPartner,
  sessionImg,
  isGroup,
}) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages)

  useEffect(() => {
    pusherClient.subscribe(toPusherKey(`chat:${chatId}`))

    const messageHandler = (message: Message) => {
      console.log('New message received:', message) // Debug log
      console.log('Session ID:', sessionId) // Debug log
      console.log('Message sender ID:', message.senderId) // Debug log
      
      setMessages((prev) => [message, ...prev])
    }

    pusherClient.bind('incoming-message', messageHandler)

    return () => {
      pusherClient.unsubscribe(toPusherKey(`chat:${chatId}`))
      pusherClient.unbind('incoming-message', messageHandler)
    }
  }, [chatId, sessionId])

  // In your Messages component
  useEffect(() => {
    const channelKey = isGroup 
      ? toPusherKey(`group:${chatId}:messages`)
      : toPusherKey(`chat:${chatId}`)
      
    pusherClient.subscribe(channelKey)
    
    const messageHandler = (message: Message) => {
      setMessages((prev) => [message, ...prev])
    }

    pusherClient.bind('new_message', messageHandler)

    return () => {
      pusherClient.unsubscribe(channelKey)
      pusherClient.unbind('new_message', messageHandler)
    }
  }, [chatId, isGroup])

  const scrollDownRef = useRef<HTMLDivElement | null>(null)

  const formatTimestamp = (timestamp: number) => {
    return format(timestamp, 'HH:mm')
  }

  // Debug: Log the current messages and sessionId
  console.log('Rendering messages:', messages.length)
  console.log('Current sessionId:', sessionId)
  
  return (
    <div
      id='messages'
      className='flex h-full flex-1 flex-col-reverse gap-4 p-3 overflow-y-auto scrollbar-thumb-blue scrollbar-thumb-rounded scrollbar-track-blue-lighter scrollbar-w-2 scrolling-touch'>
      <div ref={scrollDownRef} />

      {messages.map((message, index) => {
        // Debug each message
        console.log(`Message ${index}:`, {
          id: message.id,
          senderId: message.senderId,
          sessionId: sessionId,
          isCurrentUser: message.senderId === sessionId,
          text: message.text.substring(0, 20)
        })
        
        const isCurrentUser = message.senderId === sessionId

        const hasNextMessageFromSameUser =
          messages[index - 1]?.senderId === messages[index].senderId

        return (
          <div
            className='chat-message'
            key={`${message.id}-${message.timestamp}`}>
            <div
              className={cn('flex items-end', {
                'justify-end': isCurrentUser,
              })}>
              <div
                className={cn(
                  'flex flex-col space-y-2 text-base max-w-xs mx-2',
                  {
                    'order-1 items-end': isCurrentUser,
                    'order-2 items-start': !isCurrentUser,
                  }
                )}>
                <span
                  className={cn('px-4 py-2 rounded-lg inline-block', {
                    'bg-indigo-600 text-white': isCurrentUser,
                    'bg-gray-200 text-gray-900': !isCurrentUser,
                    'rounded-br-none':
                      !hasNextMessageFromSameUser && isCurrentUser,
                    'rounded-bl-none':
                      !hasNextMessageFromSameUser && !isCurrentUser,
                  })}>
                  {message.text}{' '}
                  <span className='ml-2 text-xs text-gray-400'>
                    {formatTimestamp(message.timestamp)}
                  </span>
                </span>
              </div>

              <div
                className={cn('relative w-6 h-6', {
                  'order-2': isCurrentUser,
                  'order-1': !isCurrentUser,
                  invisible: hasNextMessageFromSameUser,
                })}>
                <Image
                  fill
                  src={
                    isCurrentUser ? (sessionImg as string) : chatPartner?.image ?? '/default-avatar.png'
                  }
                  alt='Profile picture'
                  referrerPolicy='no-referrer'
                  className='rounded-full'
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default Messages