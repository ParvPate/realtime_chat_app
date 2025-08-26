import { OAuth2Client } from 'google-auth-library'
import { db } from '@/lib/db'
import { fetchRedis } from '@/helpers/redis'

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { idToken } = body

    if (!idToken) {
      return new Response('Missing ID token', { status: 400 })
    }

    // Verify the ID token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    })

    const payload = ticket.getPayload()
    
    if (!payload) {
      return new Response('Invalid ID token', { status: 400 })
    }

    const { sub: googleId, email, name, picture } = payload

    if (!email) {
      return new Response('Email not available', { status: 400 })
    }

    // Check if user already exists
    let existingUser = null
    try {
      const existingUserResult = await fetchRedis('get', `user:google:${googleId}`) as string | null
      if (existingUserResult) {
        existingUser = JSON.parse(existingUserResult)
      }
    } catch (err) {
      // User doesn't exist, which is fine
    }

    if (existingUser) {
      return new Response(JSON.stringify({ user: existingUser }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Create new user
    const newUser = {
      id: `google:${googleId}`,
      email,
      name: name || email,
      image: picture || null,
    }

    // Save user to Redis
    await db.set(`user:google:${googleId}`, JSON.stringify(newUser))
    
    // Also save with email as key for lookup
    await db.set(`user:email:${email}`, JSON.stringify(newUser))

    return new Response(JSON.stringify({ user: newUser }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Google mobile auth error:', error)
    
    if (error instanceof Error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}