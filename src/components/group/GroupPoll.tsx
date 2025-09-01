'use client'

import { useMemo, useState, useEffect } from 'react'
import clsx from 'clsx'
import Image from 'next/image'
import Button from '@/components/ui/Button'
import type { GroupMessage, GroupMember } from '@/types/group'

type Props = {
  message: GroupMessage
  sessionId: string
  groupId: string
  members: GroupMember[]
}

export default function GroupPoll({ message, sessionId, groupId, members }: Props) {
  const poll = message.poll!
  const [submitting, setSubmitting] = useState(false)
  const [localMulti, setLocalMulti] = useState<Set<string>>(new Set())

  const totalVotes = useMemo(() => {
    return poll.totalVotes ?? poll.options.reduce((sum, o) => sum + (o.votes?.length || 0), 0)
  }, [poll])

  const expired = typeof poll.expiresAt === 'number' && Date.now() >= poll.expiresAt

  const mySelections = useMemo(() => {
    const set = new Set<string>()
    for (const opt of poll.options) {
      if (opt.votes?.includes(sessionId)) set.add(opt.id)
    }
    return set
  }, [poll.options, sessionId])

  // keep local selection in sync with server state for multi polls
  useEffect(() => {
    if (poll.allowMultipleVotes) {
      setLocalMulti(new Set(mySelections))
    }
  }, [poll.allowMultipleVotes, mySelections])

  const hasVoted = mySelections.size > 0

  const onSelectSingle = async (optionId: string) => {
    if (expired || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/polls/${message.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIds: [optionId] }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => 'Failed to vote')
        throw new Error(text)
      }
      // No local update; realtime 'poll-updated' will refresh UI
    } catch (e) {
      console.error(e)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleMulti = async (optionId: string) => {
    if (expired || submitting) return
    // optimistic local toggle for responsive UI
    const next = new Set(localMulti)
    if (next.has(optionId)) next.delete(optionId)
    else next.add(optionId)
    setLocalMulti(next)

    // submit immediately with the full current selection
    setSubmitting(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/polls/${message.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIds: Array.from(next) }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => 'Failed to vote')
        throw new Error(text)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSubmitting(false)
    }
  }

  // removed separate Submit flow; multi-choice submits on each toggle

  const renderPercentBar = (count: number) => {
    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
    return (
      <div className="mt-1 h-1.5 w-full rounded bg-gray-200">
        <div
          className="h-1.5 rounded bg-indigo-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="mb-2 text-sm font-semibold text-gray-800">
        {poll.question}
      </div>

      <div className="space-y-2">
        {poll.options.map((opt) => {
          const myChoice = mySelections.has(opt.id)
          const count = opt.votes?.length || 0
          const isSelected = poll.allowMultipleVotes ? localMulti.has(opt.id) : myChoice

          // map voters to avatars when not anonymous
          const voterIds = poll.anonymous ? [] : (opt.votes ?? [])
          const voterImages = voterIds
            .map((uid) => members.find((m) => m.id === uid)?.image || '/default-avatar.png')
            .slice(0, 6)
          const extraVoters = Math.max(0, voterIds.length - voterImages.length)

          return (
            <button
              key={opt.id}
              type="button"
              disabled={expired || submitting}
              onClick={() => {
                if (poll.allowMultipleVotes) {
                  toggleMulti(opt.id)
                } else {
                  onSelectSingle(opt.id)
                }
              }}
              className={clsx(
                'w-full rounded-lg border px-3 py-2 text-left',
                'transition-colors',
                expired ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-50',
                isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white'
              )}
            >
              <div className="flex items-center justify-between">
                <div className={clsx('text-sm', isSelected ? 'text-indigo-700' : 'text-gray-800')}>
                  {opt.text}
                </div>
                <div className="text-xs text-gray-500">
                  {count} {count === 1 ? 'vote' : 'votes'}
                </div>
              </div>
              {renderPercentBar(count)}

              {!poll.anonymous && voterImages.length > 0 && (
                <div className="mt-2 flex items-center gap-1">
                  {voterImages.map((src, idx) => (
                    <span key={idx} className="inline-block h-4 w-4 overflow-hidden rounded-full ring-1 ring-white">
                      <Image src={src} alt="voter" width={16} height={16} />
                    </span>
                  ))}
                  {extraVoters > 0 && (
                    <span className="ml-1 text-[10px] text-gray-500">+{extraVoters}</span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="text-[11px] text-gray-500">
          {expired
            ? 'Poll ended'
            : totalVotes > 0
              ? `${totalVotes} ${totalVotes === 1 ? 'vote' : 'votes'}${hasVoted ? ' • You voted' : ''}`
              : hasVoted
                ? 'You voted'
                : 'No votes yet'}
        </div>
      </div>
    </div>
  )
}