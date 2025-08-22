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

export type GroupMessage = {
  id: string
  text: string
  senderId: string
  senderEmail?: string
  senderImage?: string | null
  timestamp: number
  // client-only UI flags
  _status?: 'sending' | 'sent'
}