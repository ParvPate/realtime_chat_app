'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { X, Plus } from 'lucide-react'

type Props = {
  chatId: string // format: group:{groupId}
  onClose: () => void
}

function getGroupId(chatId: string) {
  return chatId.startsWith('group:') ? chatId.replace('group:', '') : chatId
}

export default function GroupPollModal({ chatId, onClose }: Props) {
  const groupId = getGroupId(chatId)

  const [question, setQuestion] = useState('')
  // Option 1 is required; start with one field + ability to add more
  const [options, setOptions] = useState<string[]>([''])
  const [isCreating, setIsCreating] = useState(false)
  const [allowMultipleVotes, setAllowMultipleVotes] = useState(false)
  const [anonymous, setAnonymous] = useState(false)

  const canCreate = question.trim().length > 0 && options[0]?.trim().length > 0

  const addOption = () => {
    // allow up to 4 options (Instagram-like lightweight)
    if (options.length < 4) {
      setOptions((prev) => [...prev, ''])
    }
  }

  const removeOption = (index: number) => {
    // do not allow removing the first option (must exist)
    if (index === 0) return
    setOptions((prev) => prev.filter((_, i) => i !== index))
  }

  const updateOption = (index: number, value: string) => {
    setOptions((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const createPoll = async () => {
    if (!canCreate) return
    setIsCreating(true)
    try {
      const cleanOptions = options.map((o) => o.trim()).filter(Boolean)

      const res = await fetch(`/api/groups/${groupId}/polls/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          options: cleanOptions,
          allowMultipleVotes,
          anonymous,
        }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => 'Failed to create poll')
        throw new Error(text)
      }

      onClose()
    } catch (err) {
      console.error('Failed to create poll', err)
      // Optional: toast here if desired
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Create Poll</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close poll modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Question</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question..."
              className="w-full rounded-lg border border-gray-300 p-2 focus:border-transparent focus:ring-2 focus:ring-indigo-500"
              maxLength={120}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Options</label>

            {options.map((opt, index) => (
              <div key={index} className="mb-2 flex items-center gap-2">
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => updateOption(index, e.target.value)}
                  placeholder={index === 0 ? 'Option 1 (required)' : `Option ${index + 1}`}
                  className="flex-1 rounded-lg border border-gray-300 p-2 focus:border-transparent focus:ring-2 focus:ring-indigo-500"
                  maxLength={80}
                />
                {index > 0 && (
                  <button
                    onClick={() => removeOption(index)}
                    className="rounded p-2 text-red-500 hover:bg-red-50"
                    aria-label="Remove option"
                    title="Remove option"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}

            {options.length < 4 && (
              <button
                onClick={addOption}
                className="mt-1 inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
                aria-label="Add option"
              >
                <Plus size={16} />
                Add option
              </button>
            )}
          </div>

          <div className="flex items-center gap-4 pt-2">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="rounded"
                checked={allowMultipleVotes}
                onChange={(e) => setAllowMultipleVotes(e.target.checked)}
              />
              Multiple choices
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="rounded"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
              />
              Anonymous voting
            </label>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={createPoll} disabled={!canCreate} isLoading={isCreating}>
            Create Poll
          </Button>
        </div>
      </div>
    </div>
  )
}