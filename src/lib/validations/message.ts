import { z } from 'zod'

const dataUrlImageRegex = /^data:image\/[a-zA-Z0-9.+-]+;base64,/
const internalImagePathRegex = /^\/api\/images\/[A-Za-z0-9_-]+$/

export const messageValidator = z
  .object({
    id: z.string(),
    senderId: z.string(),
    // Keep text string but allow empty; deletion uses "__deleted__"
    text: z.string().default(''),
    // Optional image; allow data URL, absolute URL, or internal fetchable path
    image: z
      .union([
        z.string().url(),
        z.string().regex(dataUrlImageRegex, 'Invalid image data URL'),
        z.string().regex(internalImagePathRegex, 'Invalid internal image path'),
      ])
      .optional(),
    timestamp: z.number().optional(),
    // emoji reactions: { "👍": ["userId1","userId2"], "❤️": [...] }
    reactions: z.record(z.string(), z.array(z.string())).optional(),
  })
  .superRefine((val, ctx) => {
    const hasText = typeof val.text === 'string' && val.text.trim().length > 0
    const hasImage = typeof val.image === 'string' && val.image.length > 0

    if (!hasText && !hasImage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['text'],
        message: 'Either text or image is required',
      })
    }

    if (val.text === '__deleted__' && hasImage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['image'],
        message: 'Deleted messages cannot have images',
      })
    }
  })

export const messageArrayValidator = z.array(messageValidator)

export type Message = z.infer<typeof messageValidator>
