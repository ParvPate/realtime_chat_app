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
    let channelKey: string;
    let eventName: string;
    let updateEventName: string;

    if (isGroup) {
      // For group chats, subscribe to group:${groupId}
      const groupId = chatId.replace('group:', '');
      channelKey = toPusherKey(`group:${groupId}`);
      eventName = 'incoming_message';
      updateEventName = 'message_updated';
    } else {
      // For 1-1 chats, subscribe to chat:${chatId}
      channelKey = toPusherKey(`chat:${chatId}`);
      eventName = 'incoming-message';
      updateEventName = 'message-updated';
    }
    
    pusherClient.subscribe(channelKey);

    const messageHandler = (message: Message) => {
      // Add new message to the beginning of the array (since we're using flex-col-reverse)
      setMessages((prev) => [message, ...prev]);
    };

    const messageUpdatedHandler = (updated: Message) => {
      // Replace existing message by id (used for unsend/tombstone updates)
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
    };

    pusherClient.bind(eventName, messageHandler);
    pusherClient.bind(updateEventName, messageUpdatedHandler);

    return () => {
      pusherClient.unsubscribe(channelKey);
      pusherClient.unbind(eventName, messageHandler);
      pusherClient.unbind(updateEventName, messageUpdatedHandler);
    };
  }, [chatId, sessionId, isGroup]);

  const scrollDownRef = useRef<HTMLDivElement | null>(null)
  /*
  const formatTimestamp = (timestamp: number) => {
    return format(timestamp ?? Date.now(), 'HH:mm')
  }*/

  const formatTimestamp = (timestamp?: number) => {
  if (!timestamp) return '' // or return a fallback like '--:--'
  return format(timestamp, 'HH:mm')
}

  const unsendMessage = async (messageId: string) => {
    try {
      // optimistic UI update
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, text: '__deleted__' } : m))
      )

      await fetch('/api/message/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, messageId }),
      })
    } catch (e) {
      console.error('Failed to unsend message', e)
      // Optionally: refetch messages or revert optimistic change
    }
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
                    'bg-indigo-600 text-white': isCurrentUser && message.text !== '__deleted__',
                    'bg-gray-200 text-gray-900': !isCurrentUser && message.text !== '__deleted__',
                    'bg-gray-100 text-gray-500 italic': message.text === '__deleted__',
                    'rounded-br-none':
                      !hasNextMessageFromSameUser && isCurrentUser,
                    'rounded-bl-none':
                      !hasNextMessageFromSameUser && !isCurrentUser,
                  })}>
                  {message.text === '__deleted__'
                    ? (isCurrentUser ? 'You unsent a message' : 'This message was unsent')
                    : message.text}{' '}
                  <span className='ml-2 text-xs text-gray-400'>
                    {formatTimestamp(message.timestamp)}
                  </span>
                  {isCurrentUser && message.text !== '__deleted__' && (
                    <button
                      onClick={() => unsendMessage(message.id)}
                      className={cn(
                        'ml-3 text-xs underline',
                        isCurrentUser ? 'text-white/80 hover:text-white' : 'text-gray-700 hover:text-black'
                      )}
                    >
                      Unsend
                    </button>
                  )}
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