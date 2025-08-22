export interface GroupChat {
  id: string
  name: string
  description?: string
  members: string[] // user IDs
  admins: string[] // user IDs who can manage the group
  createdAt: number
  createdBy: string
  avatar?: string
}

export interface User {
  id: string
  name: string
  email: string
  image?: string
}

export interface Message {
  id: string
  senderId: string
  text: string
  timestamp: number
}

// Props interface for Messages component
export interface MessagesProps {
  chatId: string
  chatPartner: User | null
  sessionImg: string | undefined
  sessionId: string
  initialMessages: Message[]
  isGroup?: boolean
}