'use client'

import { useState, useEffect } from 'react'
import { User, GroupChat } from '@/types/db'

interface GroupMemberListProps {
  group: GroupChat
  currentUserId: string
}

export default function GroupMemberList({ group, currentUserId }: GroupMemberListProps) {
  const [members, setMembers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchMembers() {
      try {
        const memberPromises = group.members.map(async (memberId) => {
          const response = await fetch(`/api/users/${memberId}`)
          return response.json()
        })
        const memberData = await Promise.all(memberPromises)
        setMembers(memberData)
      } catch (error) {
        console.error('Failed to fetch members:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchMembers()
  }, [group.members])

  if (loading) return <div className="p-4">Loading members...</div>

  return (
    <div className="border-l border-gray-200 w-64 p-4">
      <h3 className="font-semibold mb-4">Members ({members.length})</h3>
      <div className="space-y-2">
        {members.map(member => {
          const isAdmin = group.admins.includes(member.id)
          const isCurrentUser = member.id === currentUserId
          
          return (
            <div key={member.id} className="flex items-center space-x-3 p-2 rounded hover:bg-gray-50">
              <img
                src={member.image || '/default-avatar.png'}
                alt={member.name}
                className="w-8 h-8 rounded-full"
              />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {member.name} {isCurrentUser && '(You)'}
                </p>
                {isAdmin && (
                  <span className="text-xs text-blue-600">Admin</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}