'use client'

import { useState } from 'react'
import Image from 'next/image'
import { GroupInfo, GroupMember } from '@/types/group'
import { X, Plus, Trash2, LogOut, Pencil } from 'lucide-react'
import { toast } from 'react-hot-toast'

type Props = {
  open: boolean
  onClose: () => void
  info: GroupInfo
  members: GroupMember[]
}

export default function GroupMemberList({ open, onClose, info, members }: Props) {
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState(info.name)
  const [inviteEmail, setInviteEmail] = useState('')

  if (!open) return null

  const call = async (url: string, body: any) => {
    setLoading(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success('Done')
    } catch (e: any) {
      toast.error(e.message || 'Failed')
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

          {/* Add member */}
          <div>
            <label className="text-sm text-gray-600">Invite by email</label>
            <div className="mt-1 flex gap-2">
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2"
                placeholder="friend@example.com"
              />
              <button
                onClick={() => call('/api/groups/addMember', { groupId: info.id, email: inviteEmail })}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-white disabled:opacity-50"
                disabled={loading || !inviteEmail.trim()}
                title="Add"
              >
                <Plus size={16} />
                Add
              </button>
            </div>
          </div>

          {/* Members */}
          <div>
            <div className="text-sm text-gray-600 mb-2">Members</div>
            <div className="space-y-2">
              {members.map((m) => (
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
                      <div className="text-sm">{m.name || m.email}</div>
                      <div className="text-xs text-gray-500">{m.email}</div>
                    </div>
                  </div>
                  <button
                    title="Remove"
                    onClick={() => call('/api/groups/removeMember', { groupId: info.id, memberId: m.id })}
                    className="p-2 rounded-lg hover:bg-gray-100"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Leave */}
          <div className="pt-4 border-t">
            <button
              onClick={() => call('/api/groups/leave', { groupId: info.id })}
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