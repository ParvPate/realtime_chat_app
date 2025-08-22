'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useRouter } from 'next/navigation'

type Props = { open: boolean; onClose: () => void }

export default function CreateGroupModal({ open, onClose }: Props) {
  const [name, setName] = useState('')
  const [emails, setEmails] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  if (!open) return null

  const create = async () => {
    if (!name.trim()) return toast.error('Please enter a name')
    setLoading(true)
    try {
      const res = await fetch('/api/groups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupName: name.trim(),
          // comma-separated emails (optional)
          inviteEmails: emails
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { groupId } = await res.json()
      onClose()
      router.push(`/dashboard/groups/${groupId}`)
    } catch (e: any) {
      toast.error(e.message || 'Failed to create group')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
      <div className="bg-white w-full max-w-md rounded-xl shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="font-semibold">New group</div>
          <button className="p-2 rounded-lg hover:bg-gray-100" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm text-gray-600">Group name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full border rounded-lg px-3 py-2"
              placeholder="Team Alpha"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Invite members (emails, optional)</label>
            <input
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              className="mt-1 w-full border rounded-lg px-3 py-2"
              placeholder="a@x.com, b@y.com"
            />
          </div>
          <button
            onClick={create}
            disabled={loading || !name.trim()}
            className="w-full rounded-lg bg-indigo-600 text-white py-2 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}