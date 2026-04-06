'use client'
// components/Providers.tsx
// Client-side provider wrapper. Placed here so app/layout.tsx (a server component)
// can import it without tainting the server component boundary.
import { SessionProvider } from 'next-auth/react'
import type { ReactNode } from 'react'

export function Providers({ children }: { children: ReactNode }) {
    return <SessionProvider>{children}</SessionProvider>
}
