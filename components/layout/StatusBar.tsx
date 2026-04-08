'use client'
// components/layout/StatusBar.tsx
import type { PomodoroState } from '@/types'

interface StatusBarProps {
  branch?: string
  saving?: boolean
  wordCount?: number
  onlineCount?: number
  pomodoroState?: PomodoroState
  pomodoroTime?: string
  isFocused?: boolean
  onExitFocus?: () => void
}

export function StatusBar({
  branch = 'main',
  saving = false,
  wordCount = 0,
  onlineCount = 0,
  pomodoroState = 'idle',
  pomodoroTime,
  isFocused = false,
  onExitFocus,
}: StatusBarProps) {
  const isBreak = pomodoroState === 'break' || pomodoroState === 'longBreak'

  // Focus mode bar: parse time to check < 5 min
  const isLowTime = (() => {
    if (!pomodoroTime) return false
    const [m] = pomodoroTime.split(':').map(Number)
    return m < 5
  })()

  if (isFocused) {
    return (
      <footer
        style={{
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 1rem',
          background: '#0d0d1a',
          borderTop: '1px solid #2a2a3e',
          fontFamily: 'var(--font-sans), system-ui, sans-serif',
          fontSize: '12px',
          gap: '1.5rem',
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        <span style={{ color: '#00d4a1', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="helix-blink">⊙</span> FOCUS
        </span>
        {pomodoroTime && pomodoroState !== 'idle' && (
          <span style={{ color: isLowTime ? '#f87171' : '#aaa', fontWeight: 600, letterSpacing: '0.1em' }}>
            {pomodoroTime}
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          <button
            onClick={onExitFocus}
            style={{
              background: 'none',
              border: '1px solid #333',
              borderRadius: 4,
              color: '#666',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans), system-ui, sans-serif',
              fontSize: '11px',
              padding: '2px 8px',
            }}
          >
            ✕ Exit
          </button>
        </span>
      </footer>
    )
  }

  return (
    <footer
      style={{
        height: '24px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 0.75rem',
        background: isBreak ? 'var(--yellow)' : 'var(--status-bg)',
        color: isBreak ? '#1a1a00' : 'var(--status-text)',
        fontSize: '11px',
        fontFamily: 'var(--font-sans), system-ui, sans-serif',
        gap: '1rem',
        flexShrink: 0,
        transition: 'background 0.3s ease',
        userSelect: 'none',
      }}
    >
      {pomodoroState !== 'idle' && pomodoroTime && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span className="helix-blink">◉</span> {pomodoroTime}
        </span>
      )}

      <span>⎇ {branch}</span>
      <span>{saving ? '⬡ saving...' : '⬡ saved'}</span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: '1rem' }}>
        <span>{wordCount} words</span>
        {onlineCount > 0 && <span>● {onlineCount} online</span>}
      </span>
    </footer>
  )
}
