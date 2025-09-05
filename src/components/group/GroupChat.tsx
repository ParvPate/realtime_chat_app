'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { pusherClient } from '@/lib/pusher'
import { useRouter } from 'next/navigation'
import { toPusherKey } from '@/lib/utils'
import GroupHeader from './GroupHeader'
import GroupMemberList from './GroupMemberList'
import ChatInput from '@/components/ChatInput'
import Image from 'next/image'
import clsx from 'clsx'
import { GroupInfo, GroupMember, GroupMessage } from '@/types/group'
import GroupPoll from '@/components/group/GroupPoll'

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
  const router = useRouter()
  const [messages, setMessages] = useState<GroupMessage[]>(initialMessages)
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set())
  const [showMembers, setShowMembers] = useState(false)
  const [openPickerId, setOpenPickerId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  // Track live member count so header reflects add/remove or auto-delete
  const [memberCount, setMemberCount] = useState<number>(members.length)

  // quick lookup user info
  const memberMap = useMemo(() => {
    const map = new Map<string, GroupMember>()
    members.forEach((m) => map.set(m.id, m))
    return map
  }, [members])

  // Build a lightweight array just for header count display
  const computedMembersForHeader = useMemo(() => {
    if (memberCount <= members.length) return members.slice(0, memberCount)
    // pad with placeholders if count increased beyond local details
    const placeholders: GroupMember[] = Array.from({ length: memberCount - members.length }).map(
      (_, i) => ({
        id: `placeholder-${i}`,
        name: 'Member',
        email: 'member@example.com',
        image: null,
      })
    )
    return [...members, ...placeholders]
  }, [memberCount, members])

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

    const onUpdated = (msg: GroupMessage) => {
      // Update (tombstone) message by id
      setMessages((curr) => curr.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)))
    }

    // Handle poll updates (same replace-by-id pattern; msg may include poll fields)
    const onPollUpdated = (msg: any) => {
      setMessages((curr) => curr.map((m) => (m.id === (msg as any).id ? { ...m, ...(msg as any) } : m)))
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
    pusherClient.bind('message_updated', onUpdated)
    pusherClient.bind('poll-updated', onPollUpdated)
    pusherClient.bind('typing', onTyping)
    const onDeleted = (_payload: { groupId: string }) => {
      // group was deleted (auto or admin); return to dashboard
      router.push('/dashboard')
    }
    const onGroupUpdated = (payload: { id: string; members: string[] }) => {
      if (Array.isArray(payload?.members)) {
        setMemberCount(payload.members.length)
      }
    }
    pusherClient.bind('group_deleted', onDeleted)
    pusherClient.bind('group_updated', onGroupUpdated)

    return () => {
      pusherClient.unbind('incoming_message', onIncoming)
      pusherClient.unbind('message_updated', onUpdated)
      pusherClient.unbind('poll-updated', onPollUpdated)
      pusherClient.unbind('typing', onTyping)
      pusherClient.unbind('group_deleted', onDeleted)
      pusherClient.unbind('group_updated', onGroupUpdated)
      pusherClient.unsubscribe(channel)
    }
  }, [groupId, sessionId])

  const typingText =
    typingUsers.size > 0
      ? [...typingUsers]
          .map((id) => memberMap.get(id)?.name || memberMap.get(id)?.email || 'Someone')
          .join(', ') + ' typing…'
      : ''

  const unsendMessage = async (messageId: string) => {
    try {
      // optimistic UI
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, text: '__deleted__' } : m))
      )

      await fetch('/api/message/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: `group:${groupId}`, messageId }),
      })
    } catch (e) {
      console.error('Failed to unsend message', e)
      // Optionally: revert optimistic update or refetch
    }
  }

  return (
    <div className="flex h-full flex-col">
      <GroupHeader
        info={info}
        members={computedMembersForHeader}
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
              <div
                className={clsx(
                  'max-w-[75%] rounded-2xl px-3 py-2',
                  m.type === 'poll'
                    ? 'bg-white border border-gray-200'
                    : m.text === '__deleted__'
                      ? 'bg-gray-100 text-gray-500 italic'
                      : mine
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100'
                )}
              >
                {!mine && (
                  <div className="text-xs font-medium text-gray-600 mb-1">
                    {user?.name || user?.email || 'Unknown'}
                  </div>
                )}

                {m.type === 'poll' && m.poll ? (
                  <div className="w-full">
                    <GroupPoll message={m} sessionId={sessionId} groupId={groupId} members={members} />
                  </div>
                ) : (
                  <>
                    <div className="group relative flex items-start gap-2">
                      {m.text === '__deleted__' ? (
                        <div className="whitespace-pre-wrap break-words">
                          {mine ? 'You unsent a message' : 'This message was unsent'}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {m.image ? (
                            <img
                              src={m.image}
                              alt="Image message"
                              className="max-w-xs max-h-64 rounded-md border border-gray-200"
                            />
                          ) : null}
                          {m.text ? (
                            <div className="whitespace-pre-wrap break-words">{m.text}</div>
                          ) : null}
                        </div>
                      )}

                      {/* Reaction trigger button appears to the right of the message */}
                      {!mine && m.text !== '__deleted__' && (
                        <button
                          className="self-start opacity-0 group-hover:opacity-100 transition rounded-full bg-white border border-gray-200 shadow px-2 py-1"
                          onClick={() => setOpenPickerId(openPickerId === m.id ? null : m.id)}
                          aria-label="Add reaction"
                          title="Add reaction"
                        >
                          😊
                        </button>
                      )}

                      {/* Picker under the message, aligned to the right */}
                      {openPickerId === m.id && !mine && m.text !== '__deleted__' && (
                        <div className="absolute right-0 top-full mt-1 flex gap-1 rounded-md bg-white border border-gray-200 shadow px-2 py-1 z-10">
                          {['👍','❤️','😂','😮','😢','😡'].map((e) => (
                            <button
                              key={e}
                              className="text-base hover:scale-110 transition"
                              onClick={() => {
                                fetch('/api/message/react', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ chatId: `group:${groupId}`, messageId: m.id, emoji: e }),
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
                    {m.reactions && Object.keys(m.reactions).length > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                        {Object.entries(m.reactions).map(([emo, users]) =>
                          users && users.length > 0 ? (
                            <span
                              key={emo}
                              className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-gray-700"
                            >
                              <span>{emo}</span>
                              <span className="text-[10px]">{users.length}</span>
                            </span>
                          ) : null
                        )}
                      </div>
                    )}

                    <div className={clsx('mt-1 text-[10px]', mine ? 'text-indigo-100' : 'text-gray-500')}>
                      {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {mine && m.text !== '__deleted__' && (
                        <span className="ml-2 opacity-80">{m._status === 'sending' ? '• sending' : '• sent'}</span>
                      )}
                      {mine && m.text !== '__deleted__' && (
                        <button
                          onClick={() => unsendMessage(m.id)}
                          className={clsx(
                            'ml-3 text-[10px] underline',
                            mine ? 'text-indigo-100 hover:text-white' : 'text-gray-700 hover:text-black'
                          )}
                        >
                          Unsend
                        </button>
                      )}
                    </div>
                  </>
                )}
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
        currentUserId={sessionId}
      />
    </div>
  )
}