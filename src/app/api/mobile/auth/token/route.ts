import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { signJwtForUser } from '@/lib/mobile-jwt'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    // Optional: allow client to request a custom TTL (seconds), clamp to max 90 days
    let ttlSec = 60 * 60 * 24 * 30 // default 30 days
    try {
      const body = await req.json().catch(() => ({}))
      const requested = Number(body?.ttlSec)
      if (Number.isFinite(requested) && requested > 0) {
        const max = 60 * 60 * 24 * 90
        ttlSec = Math.min(requested, max)
      }
    } catch {
      // ignore body parse errors and use default ttl
    }

    const token = signJwtForUser(session.user.id, ttlSec)
    const now = Math.floor(Date.now() / 1000)
    const expiresAt = now + ttlSec

    return new Response(JSON.stringify({ token, tokenType: 'Bearer', expiresAt }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 })
    }
    return new Response('Internal Server Error', { status: 500 })
  }
}