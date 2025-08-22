import { Redis } from '@upstash/redis' // or whatever Redis client you're using
import { nanoid } from 'nanoid'

export const db = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Add these helper functions:
export function getChatId(participants: string[]): string {
  if (participants.length === 2) {
    return `chat:${participants.sort().join(':')}`
  } else {
    // Group chat - you'll need to generate a unique group ID
    return `group:${nanoid()}`
  }
}

export function isGroupChat(chatId: string): boolean {
  return chatId.startsWith('group:')
}

export function generateGroupId(): string {
  return nanoid()
}

// Helper to get group chat ID
export function getGroupChatId(groupId: string): string {
  return `group:${groupId}`
}