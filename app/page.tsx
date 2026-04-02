import Link from 'next/link'

export default function RootPage() {
  return (
    <main style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      fontFamily: 'JetBrains Mono, monospace',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '560px' }}>
        {/* Logo */}
        <div style={{ fontSize: '48px', marginBottom: '1rem' }}>⬡</div>
        <h1 style={{
          fontSize: '36px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.03em',
          marginBottom: '0.5rem',
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>~/</span>
          <span style={{ color: 'var(--accent)' }}>helix</span>
          <span style={{ color: 'var(--accent)', animation: 'blink 1s step-end infinite', marginLeft: '2px' }}>|</span>
        </h1>
        <p style={{
          color: 'var(--text-muted)',
          fontSize: '14px',
          marginBottom: '2.5rem',
          lineHeight: 1.6,
        }}>
          Real-time collaborative notes for developers.
          <br />
          Write, plan and ship — together.
        </p>

        {/* Feature pills */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          justifyContent: 'center',
          marginBottom: '2.5rem',
        }}>
          {['Kanban boards', 'Pomodoro timer', 'Code blocks', 'Diagrams', 'Live collaboration'].map((f) => (
            <span key={f} style={{
              padding: '4px 10px',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
            }}>
              {f}
            </span>
          ))}
        </div>

        {/* CTA */}
        <Link
          href="/login"
          style={{
            display: 'inline-block',
            background: 'var(--accent)',
            color: 'var(--status-text)',
            fontWeight: 700,
            fontSize: '13px',
            padding: '10px 28px',
            borderRadius: '6px',
            textDecoration: 'none',
            transition: 'opacity 0.15s ease',
          }}
        >
          Get Started →
        </Link>
      </div>
    </main>
  )
}
