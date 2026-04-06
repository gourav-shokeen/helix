// app/api/auth/[...nextauth]/route.ts
// Catches all /api/auth/* requests (signin, signout, callback, session, csrf…)
import NextAuth from 'next-auth'
import { authOptions } from '@/auth'

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
