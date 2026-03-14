'use client'
// app/(auth)/login/page.tsx
import { createClient } from '@/lib/supabase/client'
import { APP_NAME, APP_TAGLINE } from '@/lib/constants'

export default function LoginPage() {
  const handleGoogleLogin = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        fontFamily: 'JetBrains Mono, monospace',
      }}
    >
      <div
        className="helix-fade-in"
        style={{
          textAlign: 'center',
          padding: '3rem',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          background: 'var(--surface)',
          width: '380px',
          maxWidth: '90vw',
        }}
      >
        <div style={{ fontSize: '40px', marginBottom: '0.5rem' }}>⬡</div>
        <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--accent)', marginBottom: '0.25rem' }}>
          {APP_NAME}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '2rem' }}>
          {APP_TAGLINE}
        </p>

        <button
          onClick={handleGoogleLogin}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: '6px',
            color: 'var(--status-text)',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <p style={{ marginTop: '1.5rem', color: 'var(--text-muted)', fontSize: '10px', lineHeight: 1.5 }}>
          By signing in you agree to share your workspace with collaborators you invite.
        </p>
      </div>
    </div>
  )
}
