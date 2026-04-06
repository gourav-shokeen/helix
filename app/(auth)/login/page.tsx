'use client'
// app/(auth)/login/page.tsx
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { APP_NAME, APP_TAGLINE } from '@/lib/constants'

const CODE_LINES = [
  'const doc = await helix.create()',
  '// real-time collaboration',
  'import { Editor } from "@helix"',
  'await provider.connect(docId)',
  'type User = { id: string; name: string }',
  '// Plan. Code. Collaborate.',
  'const board = new KanbanBoard()',
  'export default function Editor()',
  'await supabase.from("docs").select()',
  'provider.awareness.setLocalState()',
  'const ydoc = new Y.Doc()',
  'mermaid.initialize({ theme: "dark" })',
]

export default function LoginPage() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') ?? '/dashboard'

  const handleGoogleLogin = () => {
    signIn('google', { callbackUrl })
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
        position: 'relative',
        overflow: 'hidden',
      }}
    >

      {/* ── Scrolling code lines background ── */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        {CODE_LINES.map((line, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: `${(i / CODE_LINES.length) * 100}%`,
              left: 0,
              right: 0,
              padding: '0 2rem',
              fontSize: '11px',
              color: 'var(--accent)',
              opacity: 0.045 + (i % 3) * 0.02,
              whiteSpace: 'nowrap',
              animation: `codeScroll ${18 + i * 2.1}s linear ${i * -1.5}s infinite`,
            }}
          >
            {line}
          </div>
        ))}
      </div>

      {/* ── Scanline sweep ── */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: 'var(--accent)',
          opacity: 0.12,
          zIndex: 1,
          animation: 'scanline 6s linear infinite',
          pointerEvents: 'none',
        }}
      />

      {/* ── Vignette corners ── */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 40%, var(--bg) 100%)',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* ── Login card ── */}
      <div
        className="helix-fade-in"
        style={{
          position: 'relative',
          zIndex: 2,
          width: '360px',
          maxWidth: '90vw',
          background: 'var(--surface)',
          border: '1px solid var(--border-light)',
          borderRadius: '10px',
          padding: '36px 32px 28px',
          textAlign: 'center',
        }}
      >
        {/* icon */}
        <div
          style={{
            width: '42px',
            height: '42px',
            border: '2px solid var(--accent)',
            borderRadius: '8px',
            margin: '0 auto 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '14px',
              height: '14px',
              background: 'var(--accent)',
              borderRadius: '3px',
            }}
          />
        </div>

        {/* logo */}
        <h1
          style={{
            fontSize: '26px',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            marginBottom: '6px',
            lineHeight: 1,
          }}
        >
          <span style={{ color: 'var(--text-secondary)' }}>~/</span>
          <span style={{ color: 'var(--accent)' }}>{APP_NAME.toLowerCase()}</span>
          <span
            style={{
              color: 'var(--accent)',
              animation: 'blink 1s step-end infinite',
              marginLeft: '1px',
            }}
          >
            |
          </span>
        </h1>

        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: '11px',
            marginBottom: '28px',
            letterSpacing: '0.02em',
          }}
        >
          {APP_TAGLINE}
        </p>

        {/* divider */}
        <div
          style={{
            height: '1px',
            background: 'var(--border)',
            marginBottom: '24px',
          }}
        />

        {/* Google button */}
        <button
          onClick={handleGoogleLogin}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: '6px',
            color: 'var(--status-text)',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            transition: 'opacity 0.15s',
            letterSpacing: '0.01em',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <p
          style={{
            marginTop: '20px',
            color: 'var(--text-muted)',
            fontSize: '10px',
            lineHeight: 1.6,
          }}
        >
          By signing in you agree to share your workspace<br />with collaborators you invite.
        </p>
      </div>

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes scanline {
          0%   { transform: translateY(0); }
          100% { transform: translateY(100vh); }
        }
        @keyframes codeScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-60%); }
        }
      `}</style>
    </div>
  )
}