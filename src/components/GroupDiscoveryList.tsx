'use client'

import Link from 'next/link'
import { useState } from 'react'
import { toast } from '@/components/ui/toast'

export type DiscoverGroup = {
  id: string
  name: string
  image?: string | null
  membersCount: number
  isMember: boolean
}

type Props = {
  groups: DiscoverGroup[]
}

export default function GroupDiscoveryList({ groups }: Props) {
  const [pending, setPending] = useState<string | null>(null)
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set())

  const requestJoin = async (groupId: string) => {
    try {
      setPending(groupId)
      const res = await fetch(`/api/groups/${groupId}/join/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const txt = await res.text().catch(() => '')
      if (!res.ok) {
        throw new Error(txt || 'Failed to send request')
      }
      setRequestedIds((prev) => new Set(prev).add(groupId))
      if (txt && txt.toLowerCase().includes('already requested')) {
        toast.info('You already requested to join this group')
      } else {
        toast.success('Request sent to the group admin.')
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to send request')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <div
          key={g.id}
          className={`relative flex items-center justify-between bg-zinc-50 border p-3 rounded-md ${
            g.isMember ? 'border-indigo-300' : 'border-zinc-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-semibold">
              {g.name?.charAt(0)?.toUpperCase() || 'G'}
            </div>
            <div className="flex flex-col">
              <span className={`font-medium ${g.isMember ? 'text-indigo-700' : 'text-gray-800'}`}>
                {g.name} {g.isMember ? <em className="text-xs text-indigo-600">(You are a member)</em> : null}
              </span>
              <span className="text-xs text-gray-500">{g.membersCount} members</span>
            </div>
          </div>

          <div>
            {g.isMember ? (
              <Link
                href={`/dashboard/groups/${g.id}`}
                className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Open
              </Link>
            ) : requestedIds.has(g.id) ? (
              <span className="text-xs text-gray-500">Request sent</span>
            ) : (
              <button
                onClick={() => requestJoin(g.id)}
                disabled={pending === g.id}
                className="inline-flex items-center rounded-md bg-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                title="Ask the admin to join this group"
              >
                {pending === g.id ? 'Sending...' : 'Request access'}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}