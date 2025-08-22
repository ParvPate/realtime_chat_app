'use client'

import { useState, useEffect } from 'react'
import { pusherClient } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'

interface MessageStatusProps {
  messageId: string
  chatId: string
  isGroup: boolean
  totalRecipients?: number
}

export default function MessageStatus({ messageId, chatId, isGroup, totalRecipients }: MessageStatusProps) {
  const [deliveredCount, setDeliveredCount] = useState(0)
  const [readCount, setReadCount] = useState(0)

  useEffect(() => {
    if (!isGroup) return // Only show for group messages

    pusherClient.subscribe(toPusherKey(`message:${messageId}:status`))

    const statusHandler = ({ type, count }: { type: 'delivered' | 'read', count: number }) => {
      if (type === 'delivered') {
        setDeliveredCount(count)
      } else if (type === 'read') {
        setReadCount(count)
      }
    }

    pusherClient.bind('status_update', statusHandler)

    return () => {
      pusherClient.unsubscribe(toPusherKey(`message:${messageId}:status`))
      pusherClient.unbind('status_update', statusHandler)
    }
  }, [messageId, isGroup])

  if (!isGroup || !totalRecipients) return null

  return (
    <div className="text-xs text-gray-400 mt-1">
      {readCount > 0 ? (
        <span>Read by {readCount}</span>
      ) : deliveredCount > 0 ? (
        <span>Delivered to {deliveredCount}</span>
      ) : (
        <span>Sending...</span>
      )}
    </div>
  )
}