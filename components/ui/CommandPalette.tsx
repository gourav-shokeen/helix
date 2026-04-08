'use client'
// components/ui/CommandPalette.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useThemeStore } from '@/store/themeStore'
import { useFocusStore } from '@/store/focusStore'
import { createDocument } from '@/lib/supabase/documents'
import { useAuthStore } from '@/store/authStore'
import { renderDiagramsForExport } from '@/lib/diagramExport'

interface Command {
  id: string
  icon: string
  label: string
  action: () => void | Promise<void>
}

interface CommandPaletteProps {
  onClose: () => void
  docId?: string
  docTitle?: string
}

export function CommandPalette({ onClose, docId, docTitle }: CommandPaletteProps) {
  const { user } = useAuthStore()
  const toggleTheme = useThemeStore(state => state.toggleTheme)
  const { toggle: toggleFocus } = useFocusStore()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands: Command[] = [
    {
      id: 'new-doc',
      icon: '◈',
      label: 'New Document',
      action: async () => {
        if (!user) return
        const { data } = await createDocument(user.id)
        if (data) router.push(`/doc/${data.id}`)
      },
    },
    { id: 'dashboard', icon: '▦', label: 'Go to Dashboard', action: () => router.push('/dashboard') },
    { id: 'theme',  icon: '◑', label: 'Toggle Theme',   action: toggleTheme },
    { id: 'focus',  icon: '⬡', label: 'Toggle Focus Mode', action: toggleFocus },
    ...(docId
      ? [
          {
            id: 'export-docx',
            icon: '⌥',
            label: 'Export DOCX',
            action: async () => {
              const handler = async (e: Event) => {
                window.removeEventListener('helix:editor:json', handler)
                const { json } = (e as CustomEvent<{ json: any }>).detail
                if (!json) return

                const diagramImages = await renderDiagramsForExport(json) // ← fix

                const res = await fetch('/api/export/docx', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    content: json,
                    title: docTitle,
                    documentId: docId,
                    diagramImages, // ← fix
                  }),
                })
                if (!res.ok) return
                const blob = await res.blob()
                const url = URL.createObjectURL(blob)
                const a = window.document.createElement('a')
                a.href = url
                a.download = `${(docTitle ?? 'document').replace(/\s+/g, '-').toLowerCase()}.docx`
                a.click()
                URL.revokeObjectURL(url)
              }
              window.addEventListener('helix:editor:json', handler)
              window.dispatchEvent(new CustomEvent('helix:editor:requestjson'))
            },
          },
        ]
      : []),
  ]

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActive(0)
  }, [query])

  const execute = useCallback(
    async (cmd: Command) => {
      onClose()
      await cmd.action()
    },
    [onClose]
  )

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && filtered[active]) {
      execute(filtered[active])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '20vh',
        zIndex: 400,
      }}
      onClick={onClose}
    >
      <div
        className="helix-fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          width: '480px',
          maxWidth: '90vw',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="⌘K — search commands..."
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            background: 'none',
            border: 'none',
            borderBottom: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontSize: '13px',
            fontFamily: 'var(--font-sans), system-ui, sans-serif',
            outline: 'none',
          }}
        />
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center' }}>
              No commands found
            </div>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              onClick={() => execute(cmd)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.6rem 1rem',
                background: i === active ? 'var(--accent-dim)' : 'none',
                border: 'none',
                borderLeft: i === active ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.1s',
              }}
            >
              <span style={{ color: 'var(--accent)', fontSize: '14px' }}>{cmd.icon}</span>
              <span style={{ color: 'var(--text-primary)', fontSize: '13px' }}>{cmd.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}