interface User {
  name: string
  email: string
  image: string
  id: string
}

interface Chat {
  id: string
  messages: Message[]
}

interface Message {
  id: string
  senderId: string
  receiverId: string
  text: string
  timestamp: number
}

interface FriendRequest {
  id: string
  senderId: string
  receiverId: string
}

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
