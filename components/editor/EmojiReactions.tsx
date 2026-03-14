'use client'
// components/editor/EmojiReactions.tsx
import { useCallback, useRef, useState } from 'react'

const EMOJIS = ['🔥', '🚀', '✅', '💡', '⚡', '🎉']

interface EmojiReactionsProps {
  docId: string
}

export function EmojiReactions({ docId: _docId }: EmojiReactionsProps) {
  const [floaters, setFloaters] = useState<Array<{ id: string; emoji: string; x: number; y: number }>>([])
  const containerRef = useRef<HTMLDivElement>(null)

  const launch = useCallback((emoji: string) => {
    const id = `${Date.now()}-${Math.random()}`
    const rect = containerRef.current?.getBoundingClientRect()
    const x = rect ? rect.left + Math.random() * rect.width : window.innerWidth / 2
    const y = rect ? rect.top : window.innerHeight / 2
    setFloaters((f) => [...f, { id, emoji, x, y }])
    setTimeout(() => setFloaters((f) => f.filter((item) => item.id !== id)), 1200)
  }, [])

  return (
    <div ref={containerRef} style={{ display: 'flex', gap: '4px' }}>
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => launch(emoji)}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'border-color 0.15s' }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          {emoji}
        </button>
      ))}
      {/* Floating emojis */}
      {floaters.map((f) => (
        <span
          key={f.id}
          className="emoji-float"
          style={{ left: f.x, top: f.y }}
        >
          {f.emoji}
        </span>
      ))}
    </div>
  )
}
