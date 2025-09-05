'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { pusherClient } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { GroupChat } from '@/types/db'

interface GroupChatListProps {
  sessionId: string
  groups: GroupChat[]
}

export default function GroupChatList({ sessionId, groups }: GroupChatListProps) {
  const [activeGroups, setActiveGroups] = useState<GroupChat[]>(groups)

  useEffect(() => {
    const channel = toPusherKey(`user:${sessionId}:groups`)
    pusherClient.subscribe(channel)

    const groupCreatedHandler = (group: GroupChat) => {
      setActiveGroups((prev) => {
        // avoid duplicates
        if (prev.some((g) => g.id === group.id)) {
          return prev.map((g) => (g.id === group.id ? group : g))
        }
        return [...prev, group]
      })
    }

    const groupUpdatedHandler = (updated: GroupChat) => {
      setActiveGroups((prev) => {
        const idx = prev.findIndex((g) => g.id === updated.id)
        if (idx === -1) return [...prev, updated]
        const copy = [...prev]
        copy[idx] = { ...prev[idx], ...updated }
        return copy
      })
    }

    const groupDeletedHandler = (payload: { groupId: string }) => {
      setActiveGroups((prev) => prev.filter((g) => g.id !== payload.groupId))
    }

    pusherClient.bind('group_created', groupCreatedHandler)
    pusherClient.bind('group_updated', groupUpdatedHandler)
    pusherClient.bind('group_deleted', groupDeletedHandler)

    return () => {
      pusherClient.unbind('group_created', groupCreatedHandler)
      pusherClient.unbind('group_updated', groupUpdatedHandler)
      pusherClient.unbind('group_deleted', groupDeletedHandler)
      pusherClient.unsubscribe(channel)
    }
  }, [sessionId])

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold">Group Chats</h3>
      {activeGroups.map((group) => (
        <Link
          key={group.id}
          href={`/dashboard/groups/${group.id}`}
          className="flex items-center space-x-3 p-2 hover:bg-gray-100 rounded"
        >
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-semibold">
              {group.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="font-medium">{group.name}</p>
            <p className="text-sm text-gray-500">{group.members.length} members</p>
          </div>
        </Link>
      ))}
    </div>
  )
}