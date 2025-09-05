'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useRouter } from 'next/navigation'

type Props = { open: boolean; onClose: () => void }

type Friend = {
  id: string
  name?: string | null
  email: string
  image?: string | null
}

export default function CreateGroupModal({ open, onClose }: Props) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [friends, setFriends] = useState<Friend[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    ;(async () => {
      try {
        const res = await fetch('/api/friends/list', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        const list = Array.isArray(data?.friends) ? data.friends : []
        setFriends(
          list.map((f: any) => ({
            id: String(f.id),
            name: f?.name ?? null,
            email: f?.email ?? 'unknown@example.com',
            image: f?.image ?? null,
          }))
        )
      } catch {
        // ignore
      }
    })()
  }, [open])

  if (!open) return null

  const minFriends = 2
  const canCreate = name.trim().length > 0 && selected.length >= minFriends

  const create = async () => {
    if (!canCreate) {
      if (!name.trim()) toast.error('Please enter a group name')
      else toast.error(`Select at least ${minFriends} friends`)
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/groups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          members: selected, // server resolves friend IDs; matches API contract
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const payload = await res.json().catch(() => ({}))
      const groupId = payload?.id ?? payload?.groupId ?? ''
      if (!groupId) {
        // fallback: try to read 'id' from created object
        toast.success('Group created')
        onClose()
        return
      }
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
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-600">Select friends (min {minFriends})</label>
              <span className="text-xs text-gray-500">
                {selected.length} selected
              </span>
            </div>
            <div className="mt-2 max-h-56 overflow-y-auto space-y-2 border rounded-lg p-2">
              {friends.length === 0 ? (
                <div className="text-xs text-gray-500">No friends to add.</div>
              ) : (
                friends.map((f) => {
                  const checked = selected.includes(f.id)
                  return (
                    <label key={f.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelected((prev) => [...prev, f.id])
                          } else {
                            setSelected((prev) => prev.filter((id) => id !== f.id))
                          }
                        }}
                      />
                      <img
                        src={f.image || '/default-avatar.png'}
                        alt={f.name || f.email}
                        className="w-5 h-5 rounded-full"
                      />
                      <span>{f.name || f.email}</span>
                    </label>
                  )
                })
              )}
            </div>
          </div>

          <button
            onClick={create}
            disabled={loading || !canCreate}
            className="w-full rounded-lg bg-indigo-600 text-white py-2 disabled:opacity-50"
            title={!canCreate ? 'Enter a name and select at least 2 friends' : 'Create group'}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}