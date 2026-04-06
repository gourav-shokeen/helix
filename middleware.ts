// middleware.ts
// Auth guard: uses next-auth v4 withAuth helper.
// Supabase is not touched here — it is DB-only now.
import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
    function middleware(req) {
        const { pathname } = req.nextUrl
        const token = req.nextauth.token

        // Redirect authenticated users away from /login and /
        if ((pathname === '/login' || pathname === '/') && token) {
            return NextResponse.redirect(new URL('/dashboard', req.url))
        }

        return NextResponse.next()
    },
    {
        callbacks: {
            // Return true → allow; false → redirect to sign-in page (configured in authOptions.pages)
            authorized({ token, req }) {
                const { pathname } = req.nextUrl
                const PROTECTED = ['/dashboard', '/doc', '/graph', '/journal', '/projects', '/devlog']

                // Public API routes (next-auth callbacks) are always allowed
                if (pathname.startsWith('/api/auth')) return true

                // Public pages
                if (pathname === '/' || pathname === '/login') return true

                // Share pages are public — auth is optional there
                if (pathname.startsWith('/share')) return true

                // Protected pages require a session token
                const isProtected = PROTECTED.some((p) => pathname.startsWith(p))
                if (isProtected) return !!token

                // All other paths (including API routes): allow but let the route
                // handler call getServerSession() to enforce auth if needed
                return true
            },
        },
    }
)

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
}
