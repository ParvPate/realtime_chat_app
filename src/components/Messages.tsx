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
  const [openPickerId, setOpenPickerId] = useState<string | null>(null)

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
                <div className="group relative flex items-start gap-2">
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
                    {message.text === '__deleted__' ? (
                      <>
                        {isCurrentUser ? 'You unsent a message' : 'This message was unsent'}
                        <span className='ml-2 text-xs text-gray-400'>
                          {formatTimestamp(message.timestamp)}
                        </span>
                      </>
                    ) : (
                      <>
                        {message.image ? (
                          <div className="flex flex-col gap-2">
                            <img
                              src={message.image}
                              alt="Image message"
                              className="max-w-xs max-h-64 rounded-md border border-gray-200"
                            />
                            {message.text ? (
                              <div className="whitespace-pre-wrap break-words">{message.text}</div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="whitespace-pre-wrap break-words">{message.text}</span>
                        )}
                        <span className='ml-2 text-xs text-gray-400'>
                          {formatTimestamp(message.timestamp)}
                        </span>
                        {isCurrentUser && (
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
                      </>
                    )}
                  </span>

                  {!isCurrentUser && message.text !== '__deleted__' && (
                    <button
                      className="self-start opacity-0 group-hover:opacity-100 transition rounded-full bg-white border border-gray-200 shadow px-2 py-1"
                      onClick={() =>
                        setOpenPickerId(openPickerId === message.id ? null : message.id)
                      }
                      aria-label="Add reaction"
                      title="Add reaction"
                    >
                      😊
                    </button>
                  )}

                  {/* Picker under bubble, aligned to the right */}
                  {openPickerId === message.id && !isCurrentUser && message.text !== '__deleted__' && (
                    <div className="absolute right-0 top-full mt-1 flex gap-1 rounded-md bg-white border border-gray-200 shadow px-2 py-1 z-10">
                      {['👍','❤️','😂','😮','😢','😡'].map((e) => (
                        <button
                          key={e}
                          className="text-base hover:scale-110 transition"
                          onClick={() => {
                            fetch('/api/message/react', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ chatId, messageId: message.id, emoji: e }),
                            })
                              .catch(() => {})
                              .finally(() => setOpenPickerId(null))
                          }}
                          aria-label={`React ${e}`}
                          title={`React ${e}`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Reactions summary */}
                {message.reactions && Object.keys(message.reactions).length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                    {Object.entries(message.reactions).map(([emo, users]) => (
                      users.length > 0 ? (
                        <span
                          key={emo}
                          className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-gray-700"
                        >
                          <span>{emo}</span>
                          <span className="text-[10px]">{users.length}</span>
                        </span>
                      ) : null
                    ))}
                  </div>
                )}
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