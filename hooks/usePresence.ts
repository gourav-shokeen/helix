'use client'
// hooks/usePresence.ts
import { useEffect, useRef, useState } from 'react'
import type { User } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function usePresence(provider: any): User[] {
    const [users, setUsers] = useState<User[]>([])
    // Keep a stable ref to the debounce timer so cleanup doesn't close over stale state
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!provider) return

        const getOnlineUsers = (): User[] => {
            const states = Array.from(provider.awareness.getStates().values()) as Array<{
                user?: { name: string; color: string; id: string; avatar?: string }
            }>
            return states
                .filter((s) => s.user)
                .map((s) => ({
                    id: s.user!.id,
                    email: '',
                    name: s.user!.name,
                    avatar_url: s.user!.avatar,
                    created_at: '',
                }))
        }

        // Debounce awareness changes by 200ms.
        // Without this, rapid join/leave events (e.g. when a share viewer connects
        // via StrictMode double-mount) cause multiple re-renders in quick succession.
        // We also use JSON.stringify to prevent new array references from triggering
        // a re-render when the actual user list and their colors haven't changed!
        const update = () => {
            if (timerRef.current) clearTimeout(timerRef.current)
            timerRef.current = setTimeout(() => {
                const nextUsers = getOnlineUsers()
                setUsers((prev) => {
                    const prevStr = JSON.stringify(prev)
                    const nextStr = JSON.stringify(nextUsers)
                    return prevStr === nextStr ? prev : nextUsers
                })
            }, 200)
        }

        provider.awareness.on('change', update)
        // Run immediately (without debounce) for the first paint
        setUsers((prev) => {
            const nextUsers = getOnlineUsers()
            return JSON.stringify(prev) === JSON.stringify(nextUsers) ? prev : nextUsers
        })

        return () => {
            provider.awareness.off('change', update)
            if (timerRef.current) clearTimeout(timerRef.current)
        }
    }, [provider])

    return users
}
