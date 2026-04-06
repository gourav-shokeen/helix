// app/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/dashboard'

    // Canonical base URL: prefer the configured app URL so redirects always
    // point to helixx.me in production, not whatever origin the request came from.
    const appUrl =
        (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '') || origin

    if (code) {
        const cookieStore = await cookies()
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() { return cookieStore.getAll() },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            )
                        } catch { }
                    },
                },
            }
        )

        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            return NextResponse.redirect(`${appUrl}${next}`)
        }

        // Log server-side only — never send raw error details to the browser.
        console.error('[auth/callback] exchangeCodeForSession failed:', error.message)
    }

    return NextResponse.redirect(`${appUrl}/login?error=auth_failed`)
}
