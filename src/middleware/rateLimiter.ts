import { NextRequest, NextResponse } from 'next/server'

const rateLimitMap = new Map()

export function rateLimit(identifier: string, limit: number = 10, windowMs: number = 60000) {
  const now = Date.now()
  const windowStart = now - windowMs

  if (!rateLimitMap.has(identifier)) {
    rateLimitMap.set(identifier, [])
  }

  const requests = rateLimitMap.get(identifier)
  
  // Remove old requests
  const validRequests = requests.filter((time: number) => time > windowStart)
  
  if (validRequests.length >= limit) {
    return false // Rate limit exceeded
  }

  validRequests.push(now)
  rateLimitMap.set(identifier, validRequests)
  
  return true // Request allowed
}

export function withRateLimit(handler: Function, limit: number = 10) {
  return async (req: NextRequest, ...args: any[]) => {
    const ip = req.ip || req.headers.get('x-forwarded-for') || 'unknown'
    
    if (!rateLimit(ip, limit)) {
      return new Response('Too many requests', { status: 429 })
    }

    return handler(req, ...args)
  }
}