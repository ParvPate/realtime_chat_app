'use client'

import { useState } from 'react'
// Import Button without destructuring if it's a default export
import Button from '@/components/ui/Button' // or wherever your Button is
import { GroupChat, User } from '@/types/db' // Add User type to your types file

interface CreateGroupModalProps {
  friends: User[]
  onClose: () => void
}

export default function CreateGroupModal({ friends, onClose }: CreateGroupModalProps) {
  const [groupName, setGroupName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const createGroup = async () => {
    if (!groupName || selectedMembers.length === 0) return

    setIsLoading(true)
    try {
      const response = await fetch('/api/groups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName,
          description,
          members: selectedMembers
        })
      })

      if (response.ok) {
        onClose()
      }
    } catch (error) {
      console.error('Failed to create group:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
        <h2 className="text-xl font-semibold mb-4">Create Group Chat</h2>
        
        <input
          type="text"
          placeholder="Group name"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          className="w-full p-2 border rounded mb-3"
        />
        
        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full p-2 border rounded mb-3 h-20"
        />

        <div className="mb-4">
          <p className="font-medium mb-2">Select Members:</p>
          {friends.map((friend) => (
            <label key={friend.id} className="flex items-center space-x-2 mb-2">
              <input
                type="checkbox"
                checked={selectedMembers.includes(friend.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedMembers([...selectedMembers, friend.id])
                  } else {
                    setSelectedMembers(selectedMembers.filter(id => id !== friend.id))
                  }
                }}
              />
              <span>{friend.name}</span>
            </label>
          ))}
        </div>

        <div className="flex space-x-3">
          <Button 
            onClick={onClose} 
            className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </Button>
          <Button 
            onClick={createGroup} 
            disabled={!groupName || selectedMembers.length === 0 || isLoading}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {isLoading ? 'Creating...' : 'Create Group'}
          </Button>
        </div>
      </div>
    </div>
  )
}