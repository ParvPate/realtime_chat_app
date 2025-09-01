'use client'

import axios from 'axios'
import { FC, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import TextareaAutosize from 'react-textarea-autosize'
import Button from './ui/Button'
import GroupPollModal from './group/GroupPollModal'
import { User } from '@/types/db'
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

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const sendMessage = async () => {
    if(!input) return
    setIsLoading(true)

    try {
      await fetch('/api/message/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input, chatId })
      })

      setInput('')
      textareaRef.current?.focus()
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setIsLoading(false)
    }
  }
//Error typingTimeoutRef
  const handleTyping = () => {
    // Send typing indicator
    fetch('/api/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, isTyping: true })
    })

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Stop typing after 3 seconds
    typingTimeoutRef.current = setTimeout(() => {
      fetch('/api/typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, isTyping: false })
      })
    }, 3000)
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

        <div className="absolute right-0 bottom-0 flex justify-between py-2 pl-3 pr-2">
          <div className="flex items-center gap-2">
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
              disabled={isLoading || !input.trim()}
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
