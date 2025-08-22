'use client'

import { FC, useState } from 'react'
import { X, Plus } from 'lucide-react'
import Button from './ui/Button'
import axios from 'axios'
import { toast } from 'react-hot-toast'

interface PollCreatorProps {
  chatId: string
  onClose: () => void
  chatPartner: User
}

const PollCreator: FC<PollCreatorProps> = ({ chatId, onClose, chatPartner }) => {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [allowMultipleVotes, setAllowMultipleVotes] = useState(false)
  const [expiresIn, setExpiresIn] = useState<number | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const addOption = () => {
    if (options.length < 4) {
      setOptions([...options, ''])
    }
  }

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index))
    }
  }

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options]
    newOptions[index] = value
    setOptions(newOptions)
  }

  const createPoll = async () => {
    if (!question.trim()) {
      toast.error('Please enter a question')
      return
    }

    const validOptions = options.filter(opt => opt.trim())
    if (validOptions.length < 2) {
      toast.error('Please provide at least 2 options')
      return
    }

    setIsCreating(true)
    try {
      await axios.post('/api/message/send', {
        chatId,
        type: 'poll',
        poll: {
          question: question.trim(),
          options: validOptions.map(opt => opt.trim()),
          allowMultipleVotes,
          expiresIn
        }
      })
      
      onClose()
      toast.success('Poll created!')
    } catch (error) {
      toast.error('Failed to create poll')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Create Poll</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question..."
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              maxLength={100}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Options
            </label>
            {options.map((option, index) => (
              <div key={index} className="flex items-center space-x-2 mb-2">
                <input
                  type="text"
                  value={option}
                  onChange={(e) => updateOption(index, e.target.value)}
                  placeholder={`Option ${index + 1}`}
                  className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  maxLength={50}
                />
                {options.length > 2 && (
                  <button
                    onClick={() => removeOption(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
            
            {options.length < 4 && (
              <button
                onClick={addOption}
                className="flex items-center space-x-1 text-indigo-600 hover:text-indigo-700 text-sm"
              >
                <Plus size={16} />
                <span>Add option</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="multipleVotes"
              checked={allowMultipleVotes}
              onChange={(e) => setAllowMultipleVotes(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="multipleVotes" className="text-sm text-gray-700">
              Allow multiple votes
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Expires in
            </label>
            <select
              value={expiresIn || ''}
              onChange={(e) => setExpiresIn(e.target.value ? Number(e.target.value) : null)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">Never</option>
              <option value={3600000}>1 hour</option>
              <option value={86400000}>1 day</option>
              <option value={604800000}>1 week</option>
            </select>
          </div>
        </div>

        <div className="flex space-x-3 mt-6">
          <Button
            onClick={onClose}
            variant="ghost"
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={createPoll}
            isLoading={isCreating}
            className="flex-1"
          >
            Create Poll
          </Button>
        </div>
      </div>
    </div>
  )
}

export default PollCreator
