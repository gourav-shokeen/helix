'use client'
// components/editor/ShareDocViewer.tsx
// Read-only Tiptap editor synced live via WebSocket for share-link viewers.
// Uses the share token UUID as the WS auth param (validated server-side).
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
import { getWsUrl } from '@/lib/constants'

interface ShareDocViewerProps {
  docId: string      // document UUID — the WS room name
  shareToken: string // share_links.token UUID from the URL
}

export function ShareDocViewer({ docId, shareToken }: ShareDocViewerProps) {
  const [synced, setSynced] = useState(false)

  // ── Yjs doc: stable for the lifetime of this component ───────────────────
  // IMPORTANT: do NOT destroy in useEffect cleanup. The Tiptap Collaboration
  // extension holds a live reference; destroying it wipes the editor content.
  // Only the WebsocketProvider is torn down on cleanup.
  const ydocRef = useRef<Y.Doc | null>(null)
  if (!ydocRef.current) {
    ydocRef.current = new Y.Doc()
  }
  const ydoc = ydocRef.current

  // ── Provider ref: mirrors the pattern in Editor.tsx ───────────────────────
  // Keeping the provider in a ref (not state) means we can safely call
  // destroy() in the useEffect cleanup without triggering a re-render, and
  // the cleanup can always reach the CURRENT provider even after async code.
  const providerRef = useRef<any>(null)

  useEffect(() => {
    let cancelled = false

    const wsUrl = getWsUrl()
    console.log('[ShareDocViewer] connecting to', wsUrl, 'room', docId)

    import('y-websocket').then((mod) => {
      // If this effect was already cancelled (StrictMode cleanup ran first),
      // do NOT create a provider — the second mount's effect will create one.
      if (cancelled) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provider: any = new mod.WebsocketProvider(wsUrl, docId, ydoc, {
        params: { token: shareToken },
      })
      providerRef.current = provider

      provider.on('status', (event: { status: string }) => {
        console.log('[ShareDocViewer] WS status', event.status)
      })

      const onSync = (isSynced: boolean) => {
        console.log('[ShareDocViewer] sync', isSynced)
        if (isSynced && !cancelled) setSynced(true)
      }
      provider.on('sync', onSync)

      // Safety fallback: if the sync event never fires (e.g. empty doc),
      // reveal the editor after 5 seconds so the user isn't stuck.
      const fallbackTimer = window.setTimeout(() => {
        if (!cancelled) setSynced(true)
      }, 5000)

      // Stash cleanup helpers directly on the provider instance.
      // Cast to any to allow these ad-hoc fields without type errors.
      ;(provider as any)._viewerCleanup = () => {
        window.clearTimeout(fallbackTimer)
        provider.off('sync', onSync)
      }
    })

    return () => {
      cancelled = true
      const p = providerRef.current
      if (p) {
        p._viewerCleanup?.()
        // Destroy the WS connection but leave ydoc alive.
        // Next mount creates a fresh provider on the same ydoc.
        p.destroy()
        providerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, shareToken]) // ydoc is a stable ref — intentionally omitted

  // ── Tiptap editor: always mounted so Yjs updates render live ─────────────
  // The Collaboration extension binds the editor to ydoc reactively.
  // As the WS provider feeds updates into ydoc (step1/2/update messages),
  // the editor re-renders in place — no page reload needed.
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Must be disabled when using EnhancedCodeBlock (CodeBlockLowlight)
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
      // ── Custom nodes — must match Editor.tsx exactly so node types are recognised ──
      EnhancedCodeBlock,
      DiagramNodeExtension,
      // projectId is used only for the realtime subscription channel name.
      // The board data is always fetched by boardId (from node attrs) so docId
      // here does NOT affect what data loads — just what channel name is used.
      // The KanbanBoard subscription was also fixed to use id=eq.boardId so
      // it fires correctly regardless of the projectId value.
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
    <div style={{ width: '100%', position: 'relative' }}>
      {/* Loading overlay — non-blocking, sits above the already-mounted editor.
          Removed as soon as the WS provider signals sync (or after 5s fallback).
          After it's gone, all subsequent WS updates land live into the editor. */}
      {!synced && (
        <div
          style={{
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
          }}
        >
          ◉ loading document...
        </div>
      )}
      <EditorContent editor={editor} style={{ width: '100%' }} />
    </div>
  )
}
