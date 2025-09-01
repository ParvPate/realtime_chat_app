import crypto from 'crypto'

type JwtHeader = {
  alg: 'HS256'
  typ: 'JWT'
}

export type JwtPayload = {
  sub: string // userId
  iat: number
  exp: number
  // optional custom claims can be added here
}

function base64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function base64urlJson(obj: unknown) {
  return base64url(JSON.stringify(obj))
}

function hmacSHA256(content: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(content).digest()
}

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is not set')
  }
  return secret
}

/**
 * Sign a minimal HS256 JWT for mobile.
 * sub = userId
 * ttlSec default: 30 days
 */
export function signJwtForUser(userId: string, ttlSec = 60 * 60 * 24 * 30): string {
  const header: JwtHeader = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload: JwtPayload = {
    sub: userId,
    iat: now,
    exp: now + ttlSec,
  }

  const encodedHeader = base64urlJson(header)
  const encodedPayload = base64urlJson(payload)
  const data = `${encodedHeader}.${encodedPayload}`
  const signature = base64url(hmacSHA256(data, getSecret()))

  return `${data}.${signature}`
}

/**
 * Verify HS256 JWT and return payload if valid.
 */
export function verifyJwt(token: string): JwtPayload {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid token format')
  }
  const [encodedHeader, encodedPayload, signature] = parts
  const data = `${encodedHeader}.${encodedPayload}`
  const expected = base64url(hmacSHA256(data, getSecret()))
  if (signature !== expected) {
    throw new Error('Invalid token signature')
  }

  const payloadStr = Buffer.from(encodedPayload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  const payload = JSON.parse(payloadStr) as JwtPayload

  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== 'number' || now >= payload.exp) {
    throw new Error('Token expired')
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('Invalid subject')
  }

  return payload
}

/**
 * Extract and verify Authorization: Bearer <jwt> header and return userId (sub).
 */
export function getBearerUserId(req: Request): string {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!auth || !auth.startsWith('Bearer ')) {
    throw new Error('Missing Bearer token')
  }
  const token = auth.substring('Bearer '.length).trim()
  const payload = verifyJwt(token)
  return payload.sub
}