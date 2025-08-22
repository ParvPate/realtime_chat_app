'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { pusherClient } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import GroupHeader from './GroupHeader'
import GroupMemberList from './GroupMemberList'
import ChatInput from '@/components/ChatInput'
import Image from 'next/image'
import clsx from 'clsx'
import { GroupInfo, GroupMember, GroupMessage } from '@/types/group'

type Props = {
  groupId: string
  sessionId: string
  sessionImg: string | null
  info: GroupInfo
  members: GroupMember[]
  initialMessages: GroupMessage[]
}

export default function GroupChat({
  groupId,
  sessionId,
  sessionImg,
  info,
  members,
  initialMessages,
}: Props) {
  const [messages, setMessages] = useState<GroupMessage[]>(initialMessages)
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set())
  const [showMembers, setShowMembers] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  // quick lookup user info
  const memberMap = useMemo(() => {
    const map = new Map<string, GroupMember>()
    members.forEach((m) => map.set(m.id, m))
    return map
  }, [members])

  // auto scroll on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const channel = toPusherKey(`group:${groupId}`)
    pusherClient.subscribe(channel)

    const onIncoming = (msg: GroupMessage) => {
      // Mark matching local "sending" message as sent (by id), else append.
      setMessages((curr) => {
        const idx = curr.findIndex((m) => m.id === msg.id)
        if (idx >= 0) {
          const copy = [...curr]
          copy[idx] = { ...msg, _status: 'sent' }
          return copy
        }
        return [...curr, { ...msg, _status: 'sent' }]
      })
    }

    const onTyping = (payload: { userId: string; isTyping: boolean }) => {
      setTypingUsers((prev) => {
        const next = new Set(prev)
        if (payload.userId === sessionId) return next
        if (payload.isTyping) next.add(payload.userId)
        else next.delete(payload.userId)
        return next
      })
    }

    pusherClient.bind('incoming_message', onIncoming)
    pusherClient.bind('typing', onTyping)

    return () => {
      pusherClient.unbind('incoming_message', onIncoming)
      pusherClient.unbind('typing', onTyping)
      pusherClient.unsubscribe(channel)
    }
  }, [groupId, sessionId])

  const typingText =
    typingUsers.size > 0
      ? [...typingUsers]
          .map((id) => memberMap.get(id)?.name || memberMap.get(id)?.email || 'Someone')
          .join(', ') + ' typing…'
      : ''

  return (
    <div className="flex h-full flex-col">
      <GroupHeader
        info={info}
        members={members}
        onOpenMembers={() => setShowMembers(true)}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-white">
        {messages.map((m) => {
          const mine = m.senderId === sessionId
          const user = memberMap.get(m.senderId)
          return (
            <div key={m.id} className={clsx('flex items-start gap-3', mine ? 'justify-end' : 'justify-start')}>
              {!mine && (
                <Image
                  src={user?.image || '/default-avatar.png'}
                  width={28}
                  height={28}
                  alt={user?.name || user?.email || 'User'}
                  className="rounded-full"
                />
              )}
              <div className={clsx('max-w-[75%] rounded-2xl px-3 py-2', mine ? 'bg-indigo-600 text-white' : 'bg-gray-100')}>
                {!mine && (
                  <div className="text-xs font-medium text-gray-600 mb-1">
                    {user?.name || user?.email || 'Unknown'}
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words">{m.text}</div>
                <div className={clsx('mt-1 text-[10px]', mine ? 'text-indigo-100' : 'text-gray-500')}>
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {mine && (
                    <span className="ml-2 opacity-80">{m._status === 'sending' ? '• sending' : '• sent'}</span>
                  )}
                </div>
              </div>
              {mine && (
                <Image
                  src={sessionImg || '/default-avatar.png'}
                  width={28}
                  height={28}
                  alt="You"
                  className="rounded-full"
                />
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Typing indicator */}
      {typingText && <div className="px-4 py-1 text-xs text-gray-500">{typingText}</div>}

      {/* Input */}
      <div className="border-t">
        <ChatInput chatId={`group:${groupId}`} />
      </div>

      {/* Members panel */}
      <GroupMemberList
        open={showMembers}
        onClose={() => setShowMembers(false)}
        info={info}
        members={members}
      />
    </div>
  )
}