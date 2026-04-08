'use client'
// components/layout/RightPanel.tsx
import { Avatar } from '@/components/ui/Avatar'
import { CURSOR_COLORS } from '@/lib/constants'
import type { User, PomodoroState } from '@/types'

interface RightPanelProps {
  onlineUsers?: User[]
  pomodoroState?: PomodoroState
  pomodoroTime?: string
  pomodoroStart?: () => void
  pomodoroStop?: () => void
  isFocused?: boolean
  onToggleFocus?: () => void
}

export function RightPanel({
  onlineUsers = [],
  pomodoroState = 'idle',
  pomodoroTime,
  pomodoroStart,
  pomodoroStop,
  isFocused = false,
  onToggleFocus,
}: RightPanelProps) {
  const stateLabel: Record<PomodoroState, string> = {
    idle: 'Ready',
    working: '◉ Working',
    break: '◎ Break',
    longBreak: '◎ Long Break',
  }

  return (
    <aside
      style={{
        width: '185px',
        borderLeft: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        padding: '0.75rem',
        gap: '1rem',
        flexShrink: 0,
        opacity: isFocused ? 0 : 1,
        pointerEvents: isFocused ? 'none' : 'auto',
        transition: 'opacity 0.3s ease',
        overflowY: 'auto',
      }}
    >
      {/* Online users */}
      <section>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
          Online
        </div>
        {onlineUsers.length === 0 ? (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Only you</div>
        ) : (
          onlineUsers.map((u, i) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <Avatar name={u.name} avatarUrl={u.avatar_url} color={CURSOR_COLORS[i % CURSOR_COLORS.length]} size={20} />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.name}
              </span>
            </div>
          ))
        )}
      </section>

      {/* Pomodoro */}
      <section>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
          Pomodoro
        </div>
        <div style={{ fontSize: '20px', fontWeight: 700, color: pomodoroState === 'working' ? 'var(--accent)' : pomodoroState !== 'idle' ? 'var(--yellow)' : 'var(--text-muted)', marginBottom: '0.4rem', letterSpacing: '0.05em' }}>
          {pomodoroTime ?? '25:00'}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
          {stateLabel[pomodoroState]}
        </div>
        <button
          onClick={pomodoroState === 'idle' ? pomodoroStart : pomodoroStop}
          style={{
            width: '100%',
            padding: '0.35rem',
            background: pomodoroState === 'idle' ? 'var(--accent)' : 'var(--surface-hover)',
            border: '1px solid',
            borderColor: pomodoroState === 'idle' ? 'var(--accent)' : 'var(--border)',
            borderRadius: '4px',
            color: pomodoroState === 'idle' ? 'var(--status-text)' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '11px',
            fontFamily: 'var(--font-sans), system-ui, sans-serif',
            transition: 'all 0.15s',
          }}
        >
          {pomodoroState === 'idle' ? '▶ Start' : '■ Stop'}
        </button>
      </section>

      {/* Focus mode */}
      <section>
        <button
          onClick={onToggleFocus}
          style={{
            width: '100%',
            padding: '0.35rem',
            background: isFocused ? 'var(--accent-mid)' : 'none',
            border: '1px solid',
            borderColor: isFocused ? 'var(--accent)' : 'var(--border)',
            borderRadius: '4px',
            color: isFocused ? 'var(--accent)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '11px',
            fontFamily: 'var(--font-sans), system-ui, sans-serif',
            transition: 'all 0.15s',
          }}
        >
          {isFocused ? '⬡ Exit Focus' : '⬡ Focus Mode'}
        </button>
      </section>
    </aside>
  )
}
