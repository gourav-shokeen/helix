'use client'
// hooks/useAuth.ts
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/authStore'
import type { User } from '@/types'

export function useAuth() {
    const { user, setUser } = useAuthStore()
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const supabase = createClient()

        supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (session?.user) {
                const u = session.user
                const profile: User = {
                    id: u.id,
                    email: u.email ?? '',
                    name: u.user_metadata?.full_name ?? u.user_metadata?.name ?? u.email?.split('@')[0] ?? 'User',
                    avatar_url: u.user_metadata?.avatar_url,
                    created_at: u.created_at,
                }
                setUser(profile)
                // Ensure a public.users row exists — the trigger may have missed if the
                // schema was applied after this account was first created.
                await supabase.from('profiles').upsert(
                    { id: profile.id, email: profile.email, name: profile.name, avatar_url: profile.avatar_url ?? null },
                    { onConflict: 'id' }
                )
            }
            setLoading(false)
        })

        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                const u = session.user
                setUser({
                    id: u.id,
                    email: u.email ?? '',
                    name: u.user_metadata?.full_name ?? u.user_metadata?.name ?? u.email?.split('@')[0] ?? 'User',
                    avatar_url: u.user_metadata?.avatar_url,
                    created_at: u.created_at,
                } as User)
            } else {
                setUser(null)
            }
        })

        return () => listener.subscription.unsubscribe()
    }, [setUser])

    return { user, loading }
}
