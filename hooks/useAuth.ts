'use client'
// hooks/useAuth.ts
// Wrapper around next-auth useSession that maps to our internal User type.
// Profile creation/upsert is handled server-side in auth.ts (jwt callback)
// using the service role key. This hook is purely for reading the session.
import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useAuthStore } from '@/store/authStore'
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
                id: u.id,            // This is now a proper UUID from our jwt callback
                email: u.email ?? '',
                name: u.name ?? u.email?.split('@')[0] ?? 'User',
                avatar_url: u.image ?? undefined,
                created_at: new Date().toISOString(),
            }
            setUser(profile)
        } else {
            setUser(null)
        }
    }, [session, status, setUser])

    return { user, loading }
}
