import { z } from 'zod'

export const messageValidator = z.object({
  id: z.string(),
  senderId: z.string(),
  text: z.string(),
  timestamp: z.number().optional(),
  // emoji reactions: { "👍": ["userId1","userId2"], "❤️": [...] }
  reactions: z.record(z.string(), z.array(z.string())).optional(),
})

export const messageArrayValidator = z.array(messageValidator)

export type Message = z.infer<typeof messageValidator>
