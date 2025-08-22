import { GroupChat } from "@/types/db"

export function sanitizeGroupName(name: string): string {
  return name
    .trim()
    .replace(/[<>]/g, '') // Remove HTML tags
    .slice(0, 50) // Limit length
}

export function sanitizeDescription(description: string): string {
  return description
    .trim()
    .replace(/[<>]/g, '') // Remove HTML tags
    .slice(0, 200) // Limit length
}

export function validateGroupMembers(members: any[]): string[] {
  return members
    .filter(id => typeof id === 'string' && id.length > 0)
    .slice(0, 50) // Limit group size
}

export function isValidGroupAction(userId: string, group: GroupChat, action: 'add' | 'remove' | 'update'): boolean {
  switch (action) {
    case 'add':
    case 'remove':
    case 'update':
      return group.admins.includes(userId)
    default:
      return false
  }
}