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
    pusherClient.subscribe(toPusherKey(`user:${sessionId}:groups`))

    const groupCreatedHandler = (group: GroupChat) => {
      setActiveGroups((prev) => [...prev, group])
    }

    pusherClient.bind('group_created', groupCreatedHandler)

    return () => {
      pusherClient.unsubscribe(toPusherKey(`user:${sessionId}:groups`))
      pusherClient.unbind('group_created', groupCreatedHandler)
    }
  }, [sessionId])

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold">Group Chats</h3>
      {activeGroups.map((group) => (
        <Link
          key={group.id}
          href={`/dashboard/chat/group:${group.id}`}
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