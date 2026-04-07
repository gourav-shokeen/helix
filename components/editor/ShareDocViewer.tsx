'use client'
// components/editor/ShareDocViewer.tsx
// Mounts a real Tiptap editor synced via WebSocket for unauthenticated share viewers.
// Uses the share token UUID as the WS auth token (validated server-side via share_links table).
import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Collaboration } from '@tiptap/extension-collaboration'
import Highlight from '@tiptap/extension-highlight'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import * as Y from 'yjs'
// getWsUrl() is called at runtime inside useEffect (browser context) so
// it always has access to window.location.protocol and correctly returns wss://
// when the page is served over HTTPS (e.g. Vercel production).
import { getWsUrl } from '@/lib/constants'

interface ShareDocViewerProps {
  docId: string      // document UUID — the WS room name
  shareToken: string // share_links.token UUID from the URL
}

export function ShareDocViewer({ docId, shareToken }: ShareDocViewerProps) {
  const [synced, setSynced] = useState(false)
  // Keep ydoc stable for the lifetime of this component — do NOT destroy it in
  // useEffect cleanup because the Tiptap Collaboration extension holds a reference
  // to it and destroying it would wipe the editor content.
  const ydocRef = useRef<Y.Doc>(new Y.Doc())
  const ydoc = ydocRef.current

  useEffect(() => {
    let provider: any = null
    let cancelled = false

    // getWsUrl() is called here (inside useEffect = browser) so window is always defined.
    // This ensures ws:// is upgraded to wss:// on HTTPS (Vercel production).
    const wsUrl = getWsUrl()
    console.log('[ShareDocViewer] connecting to', wsUrl, 'room', docId)

    // Dynamic import to avoid SSR issues
    import('y-websocket').then((mod) => {
      if (cancelled) return

      provider = new mod.WebsocketProvider(wsUrl, docId, ydoc, {
        params: { token: shareToken },
      })

      provider.on('status', (event: { status: string }) => {
        console.log('[ShareDocViewer] WS status:', event.status)
      })

      const onSync = (isSynced: boolean) => {
        if (isSynced && !cancelled) setSynced(true)
      }
      provider.on('sync', onSync)

      // Fallback: show content after 4s even if sync event is missed
      const fallback = setTimeout(() => {
        if (!cancelled) setSynced(true)
      }, 4000)

      // Store cleanup refs on provider so we can clean up properly
      provider._shareCleanup = () => {
        clearTimeout(fallback)
        provider.off('sync', onSync)
      }
    })

    return () => {
      cancelled = true
      if (provider) {
        provider._shareCleanup?.()
        provider.destroy()
      }
      ydoc.destroy()
    }
  }, [docId, shareToken, ydoc])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3] },
      }),
      Collaboration.configure({ document: ydoc }),
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    editable: false,
    editorProps: {
      attributes: { class: 'tiptap-editor' },
    },
  })

  if (!synced) {
    return (
      <div style={{
        color: '#555',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 13,
        padding: '48px',
        textAlign: 'center',
        letterSpacing: '0.05em',
      }}>
        ◉ loading document...
      </div>
    )
  }

  return (
    <div style={{ width: '100%' }}>
      <EditorContent editor={editor} style={{ width: '100%' }} />
    </div>
  )
}
