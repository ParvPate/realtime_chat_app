'use client'

import { useState, useEffect } from 'react'
import { pusherClient } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'

interface TypingIndicatorProps {
  chatId: string
  currentUserId: string
}

export default function TypingIndicator({ chatId, currentUserId }: TypingIndicatorProps) {
  const [typingUsers, setTypingUsers] = useState<string[]>([])

  useEffect(() => {
    pusherClient.subscribe(toPusherKey(`chat:${chatId}:typing`))

    const typingHandler = ({ userId, isTyping }: { userId: string, isTyping: boolean }) => {
      if (userId === currentUserId) return // Don't show own typing

      setTypingUsers(prev => {
        if (isTyping) {
          return prev.includes(userId) ? prev : [...prev, userId]
        } else {
          return prev.filter(id => id !== userId)
        }
      })
    }

    pusherClient.bind('typing', typingHandler)

    return () => {
      pusherClient.unsubscribe(toPusherKey(`chat:${chatId}:typing`))
      pusherClient.unbind('typing', typingHandler)
    }
  }, [chatId, currentUserId])

  if (typingUsers.length === 0) return null

  return (
    <div className="px-4 py-2 text-sm text-gray-500">
      {typingUsers.length === 1 
        ? `Someone is typing...`
        : `${typingUsers.length} people are typing...`
      }
    </div>
  )
}