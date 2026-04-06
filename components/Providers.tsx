'use client'
// components/Providers.tsx
// Client-side provider wrapper. Placed here so app/layout.tsx (a server component)
// can import it without tainting the server component boundary.
import { SessionProvider } from 'next-auth/react'
import type { ReactNode } from 'react'

export function Providers({ children }: { children: ReactNode }) {
    // refetchInterval={0}          — disable automatic session polling
    // refetchOnWindowFocus={false} — disable refetch when tab regains focus
    // These defaults cause useSession() to return new object references on every
    // poll/focus event, which can cascade through useMemo and cause render loops.
    return (
        <SessionProvider refetchInterval={0} refetchOnWindowFocus={false}>
            {children}
        </SessionProvider>
    )
}

