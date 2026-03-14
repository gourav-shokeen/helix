'use client'
// hooks/usePresence.ts
import { useEffect, useState } from 'react'
import type { User } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function usePresence(provider: any): User[] {
    const [users, setUsers] = useState<User[]>([])

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
            setUsers(online)
        }

        provider.awareness.on('change', update)
        update()
        return () => provider.awareness.off('change', update)
    }, [provider])

    return users
}
