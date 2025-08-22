'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { toast } from 'react-hot-toast'

const CreateGroupPage = () => {
  const [name, setName] = useState('')
  const [members, setMembers] = useState<string>('') // comma separated emails
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return toast.error('Group name required')

    setLoading(true)
    try {
      await axios.post('/api/groups/create', {
        name,
        members: members.split(',').map(m => m.trim()).filter(Boolean),
      })
      toast.success('Group created!')
      router.push('/dashboard')
    } catch {
      toast.error('Failed to create group')
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
          />
        </div>
        <div>
          <label className="block text-sm font-medium">
            Members (comma-separated emails)
          </label>
          <input
            type="text"
            value={members}
            onChange={e => setMembers(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
        >
          {loading ? 'Creating...' : 'Create Group'}
        </button>
      </form>
    </div>
  )
}

export default CreateGroupPage
