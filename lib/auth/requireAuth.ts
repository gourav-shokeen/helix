// lib/auth/requireAuth.ts
// Shared auth guard for API route handlers.
// Returns the next-auth Session user or a 401 NextResponse — caller should
// check with `if (result instanceof NextResponse) return result`.
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { NextResponse } from 'next/server'

type AuthResult = { id: string; name?: string | null; email?: string | null; image?: string | null } | NextResponse

export async function requireAuth(): Promise<AuthResult> {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return session.user as { id: string; name?: string | null; email?: string | null; image?: string | null }
}
