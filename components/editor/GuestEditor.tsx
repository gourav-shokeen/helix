'use client'
// components/editor/GuestEditor.tsx — Read-only / guest-edit view for share link tokens
import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Collaboration } from '@tiptap/extension-collaboration'
import Placeholder from '@tiptap/extension-placeholder'
import * as Y from 'yjs'
import { WS_URL } from '@/lib/constants'

interface GuestEditorProps {
  docId: string
  docTitle: string
  permission: 'view' | 'edit'
}

/** Generate a short random guest name + color */
function guestIdentity() {
  const id = Math.random().toString(36).slice(2, 6).toUpperCase()
  const colors = ['#f87171', '#fb923c', '#a78bfa', '#38bdf8']
  const color = colors[Math.floor(Math.random() * colors.length)]
  return { name: `Guest-${id}`, color }
}

export function GuestEditor({ docId, docTitle, permission }: GuestEditorProps) {
  const ydocRef = useRef<Y.Doc | null>(null)
  const providerRef = useRef<any>(null)
  const [synced, setSynced] = useState(false)
  const { name: guestName, color: guestColor } = useRef(guestIdentity()).current

  // Initialise Yjs + WebSocket provider
  useEffect(() => {
    const ydoc = new Y.Doc()
    ydocRef.current = ydoc

    // Dynamically import WebsocketProvider to avoid SSR issues
    let provider: any
    ;(async () => {
      const { WebsocketProvider } = await import('y-websocket')
      provider = new WebsocketProvider(WS_URL, docId, ydoc, { connect: true })
      providerRef.current = provider

      // Set guest awareness
      provider.awareness.setLocalStateField('user', { name: guestName, color: guestColor })

      const onSync = (isSynced: boolean) => { if (isSynced) setSynced(true) }
      provider.on('sync', onSync)

      // Fallback: show editor after 4s even without sync (offline / WS down)
      const fallback = setTimeout(() => setSynced(true), 4000)
      provider.on('sync', () => clearTimeout(fallback))
    })()

    return () => {
      provider?.destroy()
      ydoc.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId])

  const isReadOnly = permission === 'view'

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: !isReadOnly,
      extensions: [
        StarterKit.configure({}),
        ...(ydocRef.current ? [Collaboration.configure({ document: ydocRef.current })] : []),
        Placeholder.configure({ placeholder: isReadOnly ? '' : 'Start typing…' }),
      ],
      editorProps: {
        attributes: {
          id: 'guest-editor-content',
          style: 'min-height: 60vh; outline: none; font-family: JetBrains Mono, monospace; font-size: 14px; line-height: 1.85; color: var(--text-primary);',
        },
      },
    },
    // Re-init when ydoc is ready
    [synced]
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'JetBrains Mono, monospace' }}>
      {/* Header */}
      <header style={{ padding: '0.6rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>⬡ Helix</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '13px', flex: 1 }}>{docTitle}</span>
        <span style={{
          fontSize: '10px',
          background: isReadOnly ? 'var(--surface-hover)' : 'var(--orange)',
          color: isReadOnly ? 'var(--text-muted)' : '#fff',
          padding: '2px 8px',
          borderRadius: '3px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          {isReadOnly ? 'read-only' : `editing as ${guestName}`}
        </span>
      </header>

      {/* Body */}
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '44px 60px' }}>
        {!synced ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Connecting to document…</div>
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>

      {/* Guest info bar */}
      {!isReadOnly && (
        <div style={{ position: 'fixed', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.4rem 0.85rem', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: guestColor, flexShrink: 0 }} />
          Editing as <strong style={{ color: 'var(--text-secondary)' }}>{guestName}</strong> · Changes sync in real-time
        </div>
      )}
    </div>
  )
}
