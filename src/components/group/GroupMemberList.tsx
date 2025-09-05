'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { GroupInfo, GroupMember } from '@/types/group'
import { X, Plus, Trash2, LogOut, Pencil } from 'lucide-react'
import { toast } from 'react-hot-toast'

type Props = {
  open: boolean
  onClose: () => void
  info: GroupInfo
  members: GroupMember[]
  currentUserId: string
}

export default function GroupMemberList({ open, onClose, info, members, currentUserId }: Props) {
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState(info.name)
  // Maintain a local copy so UI reflects updates without full page refresh
  const [localMembers, setLocalMembers] = useState<GroupMember[]>(members)
  // Determine admin on client: treat group creator as admin (info.createdBy)
  const isAdmin = info.createdBy === currentUserId

  // Friends list and selection for adding members (checkbox UI)
  const [friends, setFriends] = useState<GroupMember[]>([])
  const [selectedAddIds, setSelectedAddIds] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    ;(async () => {
      try {
        const res = await fetch('/api/friends/list', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        const list = Array.isArray(data?.friends) ? data.friends : []
        // normalize to GroupMember-like
        setFriends(
          list.map((f: any) => ({
            id: String(f.id),
            name: f.name ?? null,
            email: f.email ?? 'unknown@example.com',
            image: f.image ?? null,
          }))
        )
      } catch {
        // ignore
      }
    })()
  }, [open])

  if (!open) return null

  const call = async (url: string, body: any, onOk?: () => void) => {
    setLoading(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const txt = await res.text()
      if (!res.ok) throw new Error(txt || 'Request failed')
      toast.success('Done')
      onOk?.()
    } catch (e: any) {
      toast.error(e?.message || 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end">
      <div className="h-full w-full sm:w-[420px] bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="font-semibold">Group settings</div>
          <button className="p-2 rounded-lg hover:bg-gray-100" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-6 overflow-y-auto">
          {/* Rename */}
          <div>
            <label className="text-sm text-gray-600">Group name</label>
            <div className="mt-1 flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2"
              />
              <button
                onClick={() => call('/api/groups/rename', { groupId: info.id, name: newName })}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-white disabled:opacity-50"
                disabled={loading || !newName.trim()}
                title="Rename"
              >
                <Pencil size={16} />
                Save
              </button>
            </div>
          </div>

          {/* Add member (select friends) */}
          <div>
            <label className="text-sm text-gray-600">Add members</label>
            <div className="mt-2 max-h-40 overflow-y-auto space-y-2 border rounded-lg p-2">
              {friends
                .filter((f) => !localMembers.some((m) => m.id === f.id))
                .map((f) => {
                  const checked = selectedAddIds.includes(f.id)
                  return (
                    <label key={f.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedAddIds((prev) => [...prev, f.id])
                          } else {
                            setSelectedAddIds((prev) => prev.filter((id) => id !== f.id))
                          }
                        }}
                      />
                      <Image
                        src={f.image || '/default-avatar.png'}
                        width={20}
                        height={20}
                        alt={f.name || f.email}
                        className="rounded-full"
                      />
                      <span>{f.name || f.email}</span>
                    </label>
                  )
                })}
              {friends.filter((f) => !localMembers.some((m) => m.id === f.id)).length === 0 && (
                <div className="text-xs text-gray-500">No friends available to add.</div>
              )}
            </div>
            <button
              onClick={() =>
                call('/api/groups/addMember', { groupId: info.id, memberIds: selectedAddIds }, () => {
                  // merge new members into local list
                  const newOnes = friends.filter((f) => selectedAddIds.includes(f.id))
                  setLocalMembers((prev) => {
                    const merged = [...prev]
                    newOnes.forEach((n) => {
                      if (!merged.some((m) => m.id === n.id)) {
                        merged.push({ id: n.id, name: n.name, email: n.email, image: n.image })
                      }
                    })
                    return merged
                  })
                  setSelectedAddIds([])
                })
              }
              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-white disabled:opacity-50"
              disabled={loading || selectedAddIds.length === 0}
              title="Add selected"
            >
              <Plus size={16} />
              Add selected
            </button>
          </div>

          {/* Members */}
          <div>
            <div className="text-sm text-gray-600 mb-2">Members</div>
            <div className="space-y-2">
              {localMembers.map((m) => (
                <div key={m.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Image
                      src={m.image || '/default-avatar.png'}
                      width={28}
                      height={28}
                      alt={m.name || m.email}
                      className="rounded-full"
                    />
                    <div>
                      <div className="text-sm">
                        {m.name || m.email}{' '}
                        {m.id === info.createdBy && (
                          <span className="text-[11px] text-blue-600">(admin)</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">{m.email}</div>
                    </div>
                  </div>
                  {isAdmin && m.id !== currentUserId ? (
                    <button
                      title="Remove"
                      onClick={() =>
                        call('/api/groups/removeMember', { groupId: info.id, memberId: m.id }, () => {
                          setLocalMembers((prev) => prev.filter((x) => x.id !== m.id))
                        })
                      }
                      className="p-2 rounded-lg hover:bg-gray-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* Leave */}
          <div className="pt-4 border-t">
            <button
              onClick={() =>
                call(`/api/groups/${info.id}/leave`, {}, () => {
                  onClose()
                })
              }
              className="inline-flex items-center gap-2 text-red-600 hover:text-red-700"
              title="Leave group"
            >
              <LogOut size={16} />
              Leave group
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}