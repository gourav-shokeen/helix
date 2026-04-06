// types/next-auth.d.ts
// Augments the next-auth Session type to include the user id,
// which we inject via the session callback in auth.ts.
import 'next-auth'

declare module 'next-auth' {
    interface Session {
        user: {
            id: string
            name?: string | null
            email?: string | null
            image?: string | null
        }
    }
}
