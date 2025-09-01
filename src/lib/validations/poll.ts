import { z } from 'zod'

export const pollOptionSchema = z.object({
  id: z.string(),
  text: z.string().min(1).max(100),
  votes: z.array(z.string()), // userIds
})

export const pollSchema = z.object({
  question: z.string().min(1).max(200),
  options: z.array(pollOptionSchema).min(2).max(10),
  totalVotes: z.number().int().nonnegative(),
  allowMultipleVotes: z.boolean().default(false),
  anonymous: z.boolean().default(false),
  expiresAt: z.number().int().optional(), // epoch ms
})

export type PollOption = z.infer<typeof pollOptionSchema>
export type Poll = z.infer<typeof pollSchema>

// A group-poll message stored in group:{groupId}:messages zset
export const groupPollMessageSchema = z.object({
  id: z.string(),
  senderId: z.string(),
  text: z.string(), // keep a text summary for compatibility (e.g., "Poll: <question>")
  timestamp: z.number().int(),
  type: z.literal('poll'),
  poll: pollSchema,
})

export type GroupPollMessage = z.infer<typeof groupPollMessageSchema>