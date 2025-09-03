export type GroupInfo = {
  id: string
  name: string
  description?: string
  createdBy: string
  createdAt: number
}

export type GroupMember = {
  id: string
  name?: string | null
  email: string
  image?: string | null
}

// Poll types used by group poll messages
export type GroupPollOption = {
  id: string
  text: string
  votes: string[] // userIds
}

export type GroupPoll = {
  question: string
  options: GroupPollOption[]
  totalVotes: number
  allowMultipleVotes: boolean
  anonymous?: boolean
  expiresAt?: number
}

export type GroupMessage = {
  id: string
  text: string
  image?: string
  senderId: string
  senderEmail?: string
  senderImage?: string | null
  timestamp: number
  // optional poll payload (only when type === 'poll')
  type?: 'poll'
  poll?: GroupPoll
  // emoji reactions: { "👍": ["userId1","userId2"], "❤️": [...] }
  reactions?: Record<string, string[]>
  // client-only UI flags
  _status?: 'sending' | 'sent'
}