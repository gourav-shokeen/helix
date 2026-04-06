'use client'
// hooks/usePresence.ts
import { useEffect, useRef, useState } from 'react'
import type { User } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function usePresence(provider: any): User[] {
    const [users, setUsers] = useState<User[]>([])
    // Tracks the last serialized user list — avoids returning a new array
    // reference on every awareness ping (e.g. cursor move / keystroke).
    // Without this guard every Yjs awareness update creates a new array →
    // re-renders the parent → fires useEffects that depend on the result.
    const prevRef = useRef('')

    useEffect(() => {
        if (!provider) return

        const update = () => {
            const states = Array.from(provider.awareness.getStates().values()) as Array<{
                user?: { name: string; color: string; id: string; avatar?: string }
            }>
            const online = states
                .filter((s) => s.user)
                .map((s) => ({
                    id: s.user!.id,
                    email: '',
                    name: s.user!.name,
                    avatar_url: s.user!.avatar,
                    created_at: '',
                }))

            // Only update React state when the actual user list changed.
            const key = JSON.stringify(online)
            if (key === prevRef.current) return
            prevRef.current = key
            setUsers(online)
        }

        provider.awareness.on('change', update)
        update()
        return () => provider.awareness.off('change', update)
    }, [provider])

    return users
}
