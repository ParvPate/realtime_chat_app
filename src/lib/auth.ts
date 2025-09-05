import { NextAuthOptions } from 'next-auth'
import { UpstashRedisAdapter } from '@next-auth/upstash-redis-adapter'
import { db } from './db'
import GoogleProvider from 'next-auth/providers/google'
import { fetchRedis } from '@/helpers/redis'

function getGoogleCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || clientId.length === 0) {
    throw new Error('Missing GOOGLE_CLIENT_ID')
  }

  if (!clientSecret || clientSecret.length === 0) {
    throw new Error('Missing GOOGLE_CLIENT_SECRET')
  }

  return { clientId, clientSecret }
}

export const authOptions: NextAuthOptions = {
  adapter: UpstashRedisAdapter(db),
  session: {
    strategy: 'jwt',
  },

  pages: {
    signIn: '/login',
  },
  providers: [
    GoogleProvider({
      clientId: getGoogleCredentials().clientId,
      clientSecret: getGoogleCredentials().clientSecret,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      try {
        // Prefer existing token.id, otherwise take from freshly signed-in user.
        let id = (token as any)?.id as string | undefined
        if (!id && user) id = (user as any)?.id

        let dbUserResult: string | null = null
        if (id) {
          dbUserResult = (await fetchRedis('get', `user:${id}`)) as string | null
        }

        if (!dbUserResult) {
          if (user && !(token as any)?.id) {
            ;(token as any).id = (user as any).id
          }
          return token
        }

        const dbUser = JSON.parse(dbUserResult) as any

        return {
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email,
          picture: dbUser.image,
        }
      } catch (err) {
        // Do not crash auth flow on transient Redis/network errors.
        console.error('[auth.jwt] fetch user failed, proceeding with token', err)
        if (user && !(token as any)?.id) {
          ;(token as any).id = (user as any).id
        }
        return token
      }
    },
    async session({ session, token }) {
      try {
        const t = token as any

        // Ensure session.user exists
        if (!session.user) {
          ;(session as any).user = {} as any
        }

        if (t) {
          ;(session as any).user.id = t?.id ?? (session as any).user.id ?? ''
          ;(session as any).user.name = t?.name ?? (session as any).user.name ?? null
          ;(session as any).user.email = t?.email ?? (session as any).user.email ?? null
          ;(session as any).user.image = t?.picture ?? (session as any).user.image ?? null
        }

        return session
      } catch (err) {
        console.error('[auth.session] error mapping token to session, returning existing session', err)
        return session
      }
    },
    redirect() {
      return '/dashboard'
    },
  },
}
