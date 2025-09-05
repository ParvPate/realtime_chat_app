'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'

type Friend = {
  id: string
  name?: string | null
  email: string
  image?: string | null
}

export default function CreateGroupPage() {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [friends, setFriends] = useState<Friend[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const router = useRouter()

  useEffect(() => {
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
  }, [])

  const minFriends = 2
  const canCreate = name.trim().length > 0 && selected.length >= minFriends

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canCreate) {
      if (!name.trim()) toast.error('Group name required')
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
          members: selected, // send friend IDs
        }),
      })

      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || 'Failed to create group')
      }
      toast.success('Group created!')
      router.push('/dashboard')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create group')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-12">
      <h1 className="text-2xl font-bold mb-4">Create a new group</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Group Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full border rounded p-2"
            placeholder="Team Alpha"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">
              Select friends (min {minFriends})
            </label>
            <span className="text-xs text-gray-500">{selected.length} selected</span>
          </div>
          <div className="mt-2 max-h-64 overflow-y-auto space-y-2 border rounded p-3">
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
          type="submit"
          disabled={loading || !canCreate}
          className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 disabled:opacity-50"
          title={!canCreate ? 'Enter a name and select at least 2 friends' : 'Create group'}
        >
          {loading ? 'Creating...' : 'Create Group'}
        </button>
      </form>
    </div>
  )
}
