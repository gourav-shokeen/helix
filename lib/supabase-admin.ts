// lib/supabase-admin.ts
// Service-role Supabase client — bypasses RLS.
// ONLY import this in server-side code (API routes, server components).
// Auth is enforced via getServerSession(authOptions) BEFORE using this client.
// Never import this in client components or expose it to the browser.
//
// ─── Required environment variables (set ALL in Vercel dashboard) ────────────
//   NEXT_PUBLIC_SUPABASE_URL        Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY       Supabase service-role key (never expose client-side)
//   NEXTAUTH_URL                    Canonical app URL e.g. https://helixx.me
//   NEXTAUTH_SECRET                 Random secret: openssl rand -base64 32
//   GOOGLE_CLIENT_ID                Google OAuth client ID
//   GOOGLE_CLIENT_SECRET            Google OAuth client secret
//   NEXT_PUBLIC_APP_URL             Same as NEXTAUTH_URL (used in share links + OG)
//   NEXT_PUBLIC_WS_URL              WebSocket server URL e.g. wss://helix-ws.railway.app
//   GROQ_API_KEY                    Groq API key (required for AI summarise feature)
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)
