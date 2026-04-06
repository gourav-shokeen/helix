// lib/auth/requireAuth.ts
// Shared auth guard for API route handlers.
// Returns the authenticated user or a 401 NextResponse — caller should check
// with `if (result instanceof NextResponse) return result` before proceeding.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

type AuthResult = User | NextResponse

export async function requireAuth(): Promise<AuthResult> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (!user || error) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return user
}
