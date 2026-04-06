'use client'
// hooks/useAuth.ts
// Derives user/loading directly from next-auth useSession.
// user is memoized on stable primitives (id, email) so its object
// reference only changes when the logged-in account actually changes.
//
// KEY: useAuthStore is accessed via a selector (state => state.setUser)
// NOT via useAuthStore() (which subscribes to the entire store).
// Without the selector, every setUser() call updates the store, which
// triggers a re-render of useAuth's parent, which calls setUser again,
// causing an infinite render → infinite /api/documents loop.
import { useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useAuthStore } from '@/store/authStore'
import type { User } from '@/types'

export function useAuth() {
    const { data: session, status } = useSession()

    // Selector: subscribe ONLY to the stable setUser function, not the whole store.
    // When setUser(user) is called, store.user changes but store.setUser does not
    // — so useAuth() and its parent component do NOT re-render from the store update.
    const setUser = useAuthStore(state => state.setUser)

    const loading = status === 'loading'

    // Memoized on primitive values — object reference stable across renders.
    const user = useMemo<User | null>(() => {
        if (!session?.user?.id) return null
        return {
            id: session.user.id,
            email: session.user.email ?? '',
            name: session.user.name ?? session.user.email?.split('@')[0] ?? 'User',
            avatar_url: session.user.image ?? undefined,
            created_at: new Date().toISOString(),
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user?.id, session?.user?.email])

    // Keep Zustand store in sync for components (ShareModal, CommandPalette,
    // ProfileDropdown) that read from the store directly.
    // Pinned to session?.user?.id (primitive) — only fires when actual user changes.
    useEffect(() => {
        if (status === 'loading') return
        setUser(user)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user?.id, status])

    return { user, loading }
}
