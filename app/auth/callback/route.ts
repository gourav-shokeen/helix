// app/auth/callback/route.ts
// LEGACY — this route was used by Supabase Auth's OAuth flow.
// Since we migrated to NextAuth v4, the OAuth callback is now handled
// automatically at /api/auth/callback/google by next-auth.
//
// This file is kept as a safety redirect so any bookmarked or cached URLs
// pointing to /auth/callback are gracefully redirected to the dashboard.
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
    const { origin } = new URL(request.url)
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '') || origin
    return NextResponse.redirect(`${appUrl}/dashboard`)
}
