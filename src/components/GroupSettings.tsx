'use client'

import { useState } from 'react'
import { GroupChat, User } from '@/types/db'

interface GroupSettingsProps {
  group: GroupChat
  currentUser: User
  allUsers: User[]
  onClose: () => void
}

export default function GroupSettings({ group, currentUser, allUsers, onClose }: GroupSettingsProps) {
  const [groupName, setGroupName] = useState(group.name)
  const [description, setDescription] = useState(group.description || '')
  const [selectedNewMembers, setSelectedNewMembers] = useState<string[]>([])

  const isAdmin = group.admins.includes(currentUser.id)
  const availableUsers = allUsers.filter(user => !group.members.includes(user.id))

  const deleteGroup = async () => {
    if (!isAdmin) return
    const confirmed = window.confirm('Are you sure you want to delete this group? This action cannot be undone.')
    if (!confirmed) return
    try {
      const res = await fetch(`/api/groups/${group.id}/delete`, { method: 'POST' })
      if (res.ok) {
        onClose()
      }
    } catch (e) {
      console.error('Failed to delete group:', e)
    }
  }

  const updateGroup = async () => {
    if (!isAdmin) return

    try {
      const response = await fetch(`/api/groups/${group.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName,
          description
        })
      })

      if (response.ok) {
        // Handle success
      }
    } catch (error) {
      console.error('Failed to update group:', error)
    }
  }

  const addMembers = async () => {
    if (!isAdmin || selectedNewMembers.length === 0) return

    try {
      const response = await fetch(`/api/groups/${group.id}/members/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: selectedNewMembers })
      })

      if (response.ok) {
        setSelectedNewMembers([])
      }
    } catch (error) {
      console.error('Failed to add members:', error)
    }
  }

  const removeMember = async (memberId: string) => {
    if (!isAdmin) return

    try {
      await fetch(`/api/groups/${group.id}/members/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId })
      })
    } catch (error) {
      console.error('Failed to remove member:', error)
    }
  }

  const leaveGroup = async () => {
    try {
      await fetch(`/api/groups/${group.id}/leave`, {
        method: 'POST'
      })
      onClose()
    } catch (error) {
      console.error('Failed to leave group:', error)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <h2 className="text-xl font-semibold mb-4">Group Settings</h2>
        
        {/* Group Info */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Group Name</label>
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            disabled={!isAdmin}
            className="w-full p-2 border rounded"
          />
          
          <label className="block text-sm font-medium mt-4 mb-2">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!isAdmin}
            className="w-full p-2 border rounded h-20"
          />
          
          {isAdmin && (
            <button
              onClick={updateGroup}
              className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Update Group
            </button>
          )}
        </div>

        {/* Current Members */}
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-3">Members ({group.members.length})</h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {group.members.map(memberId => {
              const user = allUsers.find(u => u.id === memberId)
              const isGroupAdmin = group.admins.includes(memberId)
              
              return (
                <div key={memberId} className="flex items-center justify-between p-2 border rounded">
                  <div className="flex items-center space-x-3">
                    <img
                      src={user?.image || '/default-avatar.png'}
                      alt={user?.name || 'User'}
                      className="w-8 h-8 rounded-full"
                    />
                    <div>
                      <p className="font-medium">{user?.name || 'Unknown User'}</p>
                      {isGroupAdmin && <span className="text-xs text-blue-600">Admin</span>}
                    </div>
                  </div>
                  
                  {isAdmin && memberId !== currentUser.id && (
                    <button
                      onClick={() => removeMember(memberId)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Add New Members */}
        {isAdmin && availableUsers.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-3">Add Members</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {availableUsers.map(user => (
                <label key={user.id} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedNewMembers.includes(user.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedNewMembers([...selectedNewMembers, user.id])
                      } else {
                        setSelectedNewMembers(selectedNewMembers.filter(id => id !== user.id))
                      }
                    }}
                  />
                  <img
                    src={user.image || '/default-avatar.png'}
                    alt={user.name}
                    className="w-6 h-6 rounded-full"
                  />
                  <span>{user.name}</span>
                </label>
              ))}
            </div>
            
            {selectedNewMembers.length > 0 && (
              <button
                onClick={addMembers}
                className="mt-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                Add Selected Members
              </button>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3 gap-3">
          <button
            onClick={onClose}
            className="sm:flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
          >
            Close
          </button>
          <button
            onClick={leaveGroup}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Leave Group
          </button>
          {isAdmin && (
            <button
              onClick={deleteGroup}
              className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
              title="Delete group"
            >
              Delete Group
            </button>
          )}
        </div>
      </div>
    </div>
  )
}