'use client'
// hooks/useAuth.ts
// Wrapper around next-auth useSession that maps to our internal User type.
// The Supabase client is no longer used for auth — it's DB-only.
import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useAuthStore } from '@/store/authStore'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@/types'

export function useAuth() {
    const { data: session, status } = useSession()
    const { user, setUser } = useAuthStore()

    const loading = status === 'loading'

    useEffect(() => {
        if (status === 'loading') return

        if (session?.user) {
            const u = session.user
            const profile: User = {
                id: u.id,
                email: u.email ?? '',
                name: u.name ?? u.email?.split('@')[0] ?? 'User',
                avatar_url: u.image ?? undefined,
                created_at: new Date().toISOString(),
            }
            setUser(profile)

            // Upsert into public.profiles so DB foreign keys remain valid.
            // The Supabase adapter creates a row in its own `users` table; this
            // ensures our custom `profiles` table is in sync.
            const supabase = createClient()
            supabase.from('profiles').upsert(
                { id: profile.id, email: profile.email, name: profile.name, avatar_url: profile.avatar_url ?? null },
                { onConflict: 'id' }
            ).then(({ error }) => {
                if (error) console.warn('[useAuth] profiles upsert error:', error.message)
            })
        } else {
            setUser(null)
        }
    }, [session, status, setUser])

    return { user, loading }
}
