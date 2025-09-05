'use client'

import { useEffect, useState } from 'react'
import { pusherClient } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { Check, X, Users } from 'lucide-react'

type RequestItem = {
  groupId: string
  requesterId: string
  requesterEmail?: string
  requesterName?: string
  requestedAt: number
  groupName?: string
}

type Props = {
  initialRequests: RequestItem[]
  sessionUserId: string
}

export default function GroupJoinRequests({ initialRequests, sessionUserId }: Props) {
  const [requests, setRequests] = useState<RequestItem[]>(initialRequests)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    const channel = toPusherKey(`user:${sessionUserId}:group_entry_requests`)
    pusherClient.subscribe(channel)

    const onRequested = (payload: { groupId: string; requesterId: string; groupName?: string; requesterName?: string }) => {
      // Incrementally add a placeholder; page reload will hydrate full details later
      setRequests((prev) => [
        {
          groupId: payload.groupId,
          requesterId: payload.requesterId,
          requesterName: payload.requesterName,
          requestedAt: Date.now(),
          groupName: payload.groupName || 'Group',
        },
        ...prev,
      ])
    }

    pusherClient.bind('group_join_requested', onRequested)

    return () => {
      pusherClient.unbind('group_join_requested', onRequested)
      pusherClient.unsubscribe(channel)
    }
  }, [sessionUserId])

  const approve = async (groupId: string, requesterId: string) => {
    setBusy(`${groupId}:${requesterId}`)
    try {
      const res = await fetch(`/api/groups/${groupId}/join/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId }),
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || 'Approve failed')
      }
      setRequests((prev) => prev.filter((r) => !(r.groupId === groupId && r.requesterId === requesterId)))
    } catch {
      // No-op: could show toast in a future enhancement
    } finally {
      setBusy(null)
    }
  }

  const deny = async (groupId: string, requesterId: string) => {
    setBusy(`${groupId}:${requesterId}`)
    try {
      const res = await fetch(`/api/groups/${groupId}/join/deny`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId }),
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || 'Deny failed')
      }
      setRequests((prev) => prev.filter((r) => !(r.groupId === groupId && r.requesterId === requesterId)))
    } catch {
      // No-op
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      {requests.length === 0 ? (
        <p className="text-sm text-zinc-500">No join requests.</p>
      ) : (
        requests.map((r) => {
          const key = `${r.groupId}:${r.requesterId}`
          const isBusy = busy === key
          return (
            <div key={key} className="flex items-center justify-between border rounded-md p-3">
              <div className="flex items-center gap-3">
                <Users className="text-black" />
                <div className="flex flex-col">
                  <span className="font-medium">
                    {r.requesterName || r.requesterEmail || r.requesterId} wants to join {r.groupName || r.groupId}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(r.requestedAt).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  disabled={isBusy}
                  onClick={() => approve(r.groupId, r.requesterId)}
                  aria-label="approve join"
                  className="w-8 h-8 bg-indigo-600 hover:bg-indigo-700 grid place-items-center rounded-full transition hover:shadow-md disabled:opacity-50"
                  title="Approve"
                >
                  <Check className="text-white w-4 h-4" />
                </button>
                <button
                  disabled={isBusy}
                  onClick={() => deny(r.groupId, r.requesterId)}
                  aria-label="deny join"
                  className="w-8 h-8 bg-red-600 hover:bg-red-700 grid place-items-center rounded-full transition hover:shadow-md disabled:opacity-50"
                  title="Deny"
                >
                  <X className="text-white w-4 h-4" />
                </button>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}