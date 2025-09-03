'use client'

import axios from 'axios'
import { FC, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import TextareaAutosize from 'react-textarea-autosize'
import Button from './ui/Button'
import GroupPollModal from './group/GroupPollModal'
import { User } from '@/types/db'
import { Image as ImageIcon } from 'lucide-react'
/*
interface ChatInputProps {
  chatPartner: User
  chatId: string
}*/

interface ChatInputProps {
  chatId: string
  chatPartner?: User | null
}



const ChatInput: FC<ChatInputProps> = ({ chatPartner, chatId }) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [input, setInput] = useState<string>('')
  const [showPoll, setShowPoll] = useState(false)
  const [image, setImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const sendMessage = async () => {
    if (!input.trim() && !image) return
    setIsLoading(true)

    try {
      await fetch('/api/message/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input.trim(), image, chatId }),
      })

      setInput('')
      setImage(null)
      textareaRef.current?.focus()
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setIsLoading(false)
    }
  }
//Error typingTimeoutRef
  const handleTyping = () => {
    // Avoid spamming when offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) return

    // Send typing indicator (ignore network errors)
    fetch('/api/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, isTyping: true }),
    }).catch(() => {})

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Stop typing after 3 seconds (ignore network errors)
    typingTimeoutRef.current = setTimeout(() => {
      fetch('/api/typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, isTyping: false }),
      }).catch(() => {})
    }, 3000)
  }

  // Image handlers
  const handlePickImage = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Limit to ~700KB to fit Redis/Upstash 1MB value limit once base64-encoded
    const MAX_BYTES = 700 * 1024
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      e.target.value = ''
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error('Image is too large (max 700KB)')
      e.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setImage(result)
    }
    reader.onerror = () => {
      toast.error('Failed to read image')
    }
    reader.readAsDataURL(file)
  }

  const removeImage = () => {
    setImage(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  /*
  return (
    <div className='border-t border-gray-200 px-4 pt-4 mb-2 sm:mb-0'>
      <div className='relative flex-1 overflow-hidden rounded-lg shadow-sm ring-1 ring-inset ring-gray-300 focus-within:ring-2 focus-within:ring-indigo-600'>
        <TextareaAutosize
          ref={textareaRef}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage()
            }
          }}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Message ${chatPartner.name}`}
          className='block w-full resize-none border-0 bg-transparent text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:py-1.5 sm:text-sm sm:leading-6'
        />

        <div
          onClick={() => textareaRef.current?.focus()}
          className='py-2'
          aria-hidden='true'>
          <div className='py-px'>
            <div className='h-9' />
          </div>
        </div>

        <div className='absolute right-0 bottom-0 flex justify-between py-2 pl-3 pr-2'>
          <div className='flex-shrin-0'>
            <Button isLoading={isLoading} onClick={sendMessage} type='submit'>
              Post
            </Button>
          </div>
        </div>
      </div>
    </div>
  )*/

  return (
    <div className="border-t border-gray-200 px-4 pt-4 mb-2 sm:mb-0">
      <div className="relative flex-1 overflow-hidden rounded-lg shadow-sm ring-1 ring-inset ring-gray-300 focus-within:ring-2 focus-within:ring-indigo-600">
        <textarea
          ref={textareaRef}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage()
            }
          }}
          onChange={(e) => {
            setInput(e.target.value)
            handleTyping()
          }}
          rows={1}
          value={input}
          placeholder="Message..."
          className="block w-full resize-none border-0 bg-transparent py-1.5 px-3 text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:text-sm sm:leading-6"
        />

        <div className="py-2" aria-hidden="true">
          <div className="py-px">
            <div className="h-9" />
          </div>
        </div>

        {/* Image preview */}
        {image && (
          <div className="px-3 pb-2">
            <div className="relative inline-block">
              <img
                src={image}
                alt="attachment"
                className="max-h-40 rounded-md border border-gray-200"
              />
              <button
                type="button"
                onClick={removeImage}
                className="absolute -top-2 -right-2 rounded-full bg-white border border-gray-300 text-gray-600 hover:text-black shadow px-2 py-1 text-xs"
                aria-label="Remove image"
                title="Remove image"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div className="absolute right-0 bottom-0 flex justify-between py-2 pl-3 pr-2">
          <div className="flex items-center gap-2">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            <Button
              type="button"
              variant="ghost"
              onClick={handlePickImage}
              aria-label="Attach image"
              title="Attach image"
              className="inline-flex items-center rounded-md px-2 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <ImageIcon className="h-5 w-5" />
            </Button>

            {chatId.startsWith('group:') && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowPoll(true)}
                className="inline-flex items-center rounded-md px-3 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
              >
                Create Poll
              </Button>
            )}
            <Button
              disabled={isLoading || (!input.trim() && !image)}
              onClick={sendMessage}
              type="submit"
              className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
            >
              Send
            </Button>
          </div>
        </div>
      </div>
      {showPoll && (
        <GroupPollModal
          chatId={chatId}
          onClose={() => setShowPoll(false)}
        />
      )}
    </div>
  )


}

export default ChatInput
