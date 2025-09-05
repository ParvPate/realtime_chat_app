'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { pusherClient } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'

type Props = {
  sessionId: string
  initialCount: number
}

export default function GcRequestSidebarOptions({ sessionId, initialCount }: Props) {
  const [count, setCount] = useState<number>(initialCount)

  useEffect(() => {
    const channel = toPusherKey(`user:${sessionId}:group_entry_requests`)
    pusherClient.subscribe(channel)

    const onRequested = () => setCount((prev) => prev + 1)

    const onInboxUpdated = (payload: { count?: number; action?: 'removed' | 'reset'; groupId?: string; requesterId?: string }) => {
      if (typeof payload?.count === 'number') {
        setCount(payload.count)
      } else {
        // fallback behavior: decrement but not below zero
        setCount((prev) => Math.max(0, prev - 1))
      }
    }

    pusherClient.bind('group_join_requested', onRequested)
    pusherClient.bind('group_join_inbox_updated', onInboxUpdated)

    return () => {
      pusherClient.unbind('group_join_requested', onRequested)
      pusherClient.unbind('group_join_inbox_updated', onInboxUpdated)
      pusherClient.unsubscribe(channel)
    }
  }, [sessionId])

  return (
    <Link
      href="/dashboard/requests-gc"
      className="text-gray-700 hover:text-indigo-600 hover:bg-gray-50 group flex items-center gap-3 rounded-md p-2 text-sm leading-6 font-semibold"
    >
      <span className="text-gray-400 border-gray-200 group-hover:border-indigo-600 group-hover:text-indigo-600 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[0.625rem] font-medium bg-white">
        <Users className="h-4 w-4" />
      </span>
      <span className="truncate">GC Entry Request</span>
      {count > 0 ? (
        <div className="rounded-full w-5 h-5 text-xs flex justify-center items-center text-white bg-indigo-600">
          {count}
        </div>
      ) : null}
    </Link>
  )
}