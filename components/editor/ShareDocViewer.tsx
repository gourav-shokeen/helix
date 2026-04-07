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
import { EnhancedCodeBlock } from './CodeBlockNode'
import { DiagramNodeExtension } from './DiagramNode'
import { KanbanBlockExtension } from './KanbanBlock'
import { CommentMarkExtension } from './CommentMark'
import { GitHubIssueNode } from './GitHubIssueNode'
// getWsUrl() is called at runtime inside useEffect (browser context) so
// it always has access to window.location.protocol and correctly returns wss://
// when the page is served over HTTPS (e.g. Vercel production).
import { getWsUrl } from '@/lib/constants'

interface ShareDocViewerProps {
  docId: string      // document UUID — the WS room name
  shareToken: string // share_links.token UUID from the URL
}

export function ShareDocViewer({ docId, shareToken }: ShareDocViewerProps) {
  // Overlay is shown until first sync; editor is always mounted so Yjs
  // updates flow into it live even before the overlay is hidden.
  const [synced, setSynced] = useState(false)

  // Keep ydoc stable for the lifetime of this component — created once on mount.
  // IMPORTANT: do NOT destroy in useEffect cleanup. The Tiptap Collaboration
  // extension holds a live reference; destroying it wipes the editor content.
  // Only the WebsocketProvider is destroyed on cleanup.
  const ydocRef = useRef<Y.Doc | null>(null)
  if (!ydocRef.current) {
    ydocRef.current = new Y.Doc()
  }
  const ydoc = ydocRef.current

  useEffect(() => {
    let provider: any = null
    let cancelled = false

    // getWsUrl() is called here (inside useEffect = browser) so window is always defined.
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
        console.log('[ShareDocViewer] sync event:', isSynced)
        if (isSynced && !cancelled) setSynced(true)
      }
      provider.on('sync', onSync)

      // Fallback: show content after 5s even if sync event is missed
      const fallback = setTimeout(() => {
        if (!cancelled) {
          console.log('[ShareDocViewer] fallback timeout — showing content')
          setSynced(true)
        }
      }, 5000)

      provider._shareCleanup = () => {
        clearTimeout(fallback)
        provider.off('sync', onSync)
      }
    })

    return () => {
      cancelled = true
      if (provider) {
        provider._shareCleanup?.()
        // Only destroy the PROVIDER (WS connection), NOT the ydoc.
        // The ydoc is kept alive via ydocRef so the Tiptap editor
        // retains its content across StrictMode double-invocations.
        provider.destroy()
      }
    }
    // ydoc is stable (ref) — eslint-disable-next-line is intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, shareToken])

  // FIX 1: Always mount the editor so Yjs updates flow into it in real time.
  // The editor is reactive — content updates live as WS messages arrive.
  // We register all the same custom extensions as the main Editor.tsx so that
  // code blocks, diagrams, kanban boards, etc. correctly render in read mode.
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // FIX 2: disable the basic codeBlock so EnhancedCodeBlock takes over
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
      // FIX 2: register custom node extensions so they render correctly
      EnhancedCodeBlock,
      DiagramNodeExtension,
      // KanbanBoard needs a projectId to fetch data; docId is the closest equivalent
      KanbanBlockExtension.configure({ projectId: docId }),
      CommentMarkExtension,
      GitHubIssueNode.configure({ repo: null }),
    ],
    editable: false,
    editorProps: {
      attributes: { class: 'tiptap-editor' },
    },
  })

  return (
    // FIX 1: Always render editor. Show a loading overlay until first sync arrives.
    // Once removed, subsequent WS updates keep rendering live without any page reload.
    <div style={{ width: '100%', position: 'relative' }}>
      {/* Loading overlay — sits on top of the (already-mounted) editor */}
      {!synced && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'flex-start',
          paddingTop: 48,
          justifyContent: 'center',
          background: 'transparent',
          pointerEvents: 'none',
          color: '#555',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 13,
          letterSpacing: '0.05em',
        }}>
          ◉ loading document...
        </div>
      )}
      <EditorContent editor={editor} style={{ width: '100%' }} />
    </div>
  )
}
