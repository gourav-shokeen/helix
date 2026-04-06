// auth.ts — NextAuth v4 configuration (JWT strategy)
// Google OAuth is handled entirely by next-auth; Supabase is DB-only.
// On first login, we upsert a row into public.profiles with a proper UUID so
// that documents.owner_id (uuid FK → public.profiles.id) works correctly.
import NextAuth, { type NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { randomUUID } from 'crypto'

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
    ],

    session: {
        strategy: 'jwt',
    },

    callbacks: {
        // Runs on sign-in (account & user are present) and on every JWT refresh.
        // We upsert the user into public.profiles on first sign-in and persist
        // the UUID in the token so all downstream DB writes use the correct UUID.
        async jwt({ token, user, account }) {
            if (account && user) {
                try {
                    const { data: existing, error: lookupError } = await supabaseAdmin
                        .from('profiles')
                        .select('id')
                        .eq('email', user.email)
                        .single()

                    if (lookupError && lookupError.code !== 'PGRST116') {
                        // PGRST116 = "no rows found" — anything else is a real error
                        console.error('[auth] Profile lookup error:', lookupError)
                    }

                    if (existing?.id) {
                        // Existing user — persist their UUID in the token.
                        token.id = existing.id
                    } else {
                        // New user — generate a fresh UUID and insert the profile row.
                        const newId = randomUUID()
                        const { error: insertError } = await supabaseAdmin
                            .from('profiles')
                            .insert({
                                id: newId,
                                email: user.email,
                                name: user.name ?? user.email?.split('@')[0] ?? 'User',
                                avatar_url: user.image ?? null,
                            })

                        if (insertError) {
                            console.error('[auth] Profile insert error:', insertError)
                        } else {
                            token.id = newId
                        }
                    }
                } catch (e) {
                    console.error('[auth] JWT callback error:', e)
                }
            }
            return token
        },

        async session({ session, token }) {
            if (session.user) {
                // Replace Google's numeric ID with our Supabase UUID.
                session.user.id = token.id as string
            }
            return session
        },
    },

    pages: {
        signIn: '/login',
        error: '/login',
    },
}

export default NextAuth(authOptions)