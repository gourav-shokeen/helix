'use client'
// components/editor/Editor.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Collaboration } from '@tiptap/extension-collaboration'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { Node as ProseMirrorNode } from '@tiptap/pm/model'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { DiagramNodeExtension } from './DiagramNode'
import { KanbanBlockExtension } from '@/components/editor/KanbanBlock'
import { EnhancedCodeBlock } from './CodeBlockNode'
import { CommentMarkExtension } from './CommentMark'
import { GitHubIssueNode } from './GitHubIssueNode'
import { SlashMenu } from './SlashMenu'
import { WS_URL, CURSOR_COLORS } from '@/lib/constants'
import type { User } from '@/types'

interface EditorProps {
  documentId: string
  user: User
  onWordCount?: (count: number) => void
  onProviderReady?: (provider: unknown) => void
  onOpenBrain?: () => void
  onOpenDiagram?: () => void
  onDiagramReady?: (fn: (syntax: string) => void) => void
  onDiagramUpdateReady?: (fn: (id: string, dsl: string) => void) => void
  onCommentMarkReady?: (fn: (threadId: string) => void) => void
  onCommentMarkRemoveReady?: (fn: (threadId: string) => void) => void
  readOnly?: boolean
  githubRepo?: string | null
}

// Inner component — only ever mounted with real ydoc + provider, never null
function TiptapEditor({
  projectId,
  ydoc,
  readOnly,
  githubRepo,
  onWordCount,
  onOpenBrain,
  onOpenDiagram,
  onDiagramReady,
  onDiagramUpdateReady,
  onCommentMarkReady,
  onCommentMarkRemoveReady,
}: {
  projectId: string
  ydoc: Y.Doc
  readOnly: boolean
  githubRepo?: string | null
  onWordCount?: (count: number) => void
  onOpenBrain?: () => void
  onOpenDiagram?: () => void
  onDiagramReady?: (fn: (syntax: string) => void) => void
  onDiagramUpdateReady?: (fn: (id: string, dsl: string) => void) => void
  onCommentMarkReady?: (fn: (threadId: string) => void) => void
  onCommentMarkRemoveReady?: (fn: (threadId: string) => void) => void
}) {
  const handleUpdate = useCallback(
    ({ editor: e }: { editor: any }) => {
      onWordCount?.(e?.storage?.characterCount?.words?.() ?? 0)
    },
    [onWordCount]
  )

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({}),
      Collaboration.configure({ document: ydoc }),
      Placeholder.configure({
        placeholder: 'Start writing… type / for commands',
        showOnlyCurrent: true,
      }),
      CharacterCount,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      EnhancedCodeBlock,
      DiagramNodeExtension,
      KanbanBlockExtension.configure({ projectId }),
      CommentMarkExtension,
      GitHubIssueNode.configure({ repo: githubRepo ?? null }),
    ],
    editable: !readOnly,
    editorProps: {
      attributes: { class: 'tiptap-editor' },
    },
    onUpdate: handleUpdate,
  })

  // README import from localStorage (set by handleImportReadme in doc page)
  useEffect(() => {
    if (!editor) return
    const key = `helix_readme_import_${projectId}`
    const markdown = localStorage.getItem(key)
    if (!markdown) return
    localStorage.removeItem(key)
    // Minimal markdown → HTML conversion for README display
    const html = markdown
      .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .split(/\n\n+/)
      .map(block => block.trim())
      .filter(Boolean)
      .map(block => (block.startsWith('<') ? block : `<p>${block.replace(/\n/g, ' ')}</p>`))
      .join('')
    editor.commands.setContent(html)
  }, [editor, projectId])

  // ⌘⇧K → insert '/' to trigger slash menu
  useEffect(() => {
    if (!editor) return
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'K') {
        e.preventDefault()
        editor.chain().focus().insertContent('/').run()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editor])

  // Expose diagram insert function up to EditorWrapper
  useEffect(() => {
    if (!editor || !onDiagramReady) return
    onDiagramReady((syntax: string) => {
      editor.chain().focus().insertContent({
        type: 'diagramNode',
        attrs: {
          dsl: syntax,
          id: crypto.randomUUID(),
        },
      }).run()
    })
  }, [editor, onDiagramReady])

  useEffect(() => {
    if (!editor || !onDiagramUpdateReady) return
    onDiagramUpdateReady((id: string, dsl: string) => {
      const { state, view } = editor
      let tr = state.tr
      state.doc.descendants((pmNode: ProseMirrorNode, pos: number) => {
        if (pmNode.type.name !== 'diagramNode') return
        if (pmNode.attrs.id !== id) return
        tr = tr.setNodeMarkup(pos, undefined, {
          ...pmNode.attrs,
          dsl,
        })
      })
      if (tr.docChanged) {
        view.dispatch(tr)
      }
    })
  }, [editor, onDiagramUpdateReady])

  // Expose comment mark apply function
  useEffect(() => {
    if (!editor || !onCommentMarkReady) return
    onCommentMarkReady((threadId: string) => {
      editor.chain().focus().setMark('commentMark', { threadId }).run()
    })
  }, [editor, onCommentMarkReady])

  useEffect(() => {
    if (!editor || !onCommentMarkRemoveReady) return
    onCommentMarkRemoveReady((threadId: string) => {
      const { state, view } = editor
      let tr = state.tr
      state.doc.descendants((node, pos) => {
        if (!node.marks?.length || !node.isText) return
        node.marks.forEach((mark) => {
          if (mark.type.name === 'commentMark' && mark.attrs?.threadId === threadId) {
            tr = tr.removeMark(pos, pos + node.nodeSize, mark.type)
          }
        })
      })
      if (tr.docChanged) {
        view.dispatch(tr)
      }
    })
  }, [editor, onCommentMarkRemoveReady])

  return (
    <>
      <EditorContent editor={editor} />
      {editor && !readOnly && onOpenBrain && (
        <SlashMenu
          editor={editor}
          onOpenBrain={onOpenBrain}
          onOpenDiagram={onOpenDiagram}
          projectId={projectId}
        />
      )}
    </>
  )
}

// Outer component — manages Yjs lifecycle, gates render until ready
export function Editor({
  documentId,
  user,
  onWordCount,
  onProviderReady,
  onOpenBrain,
  onOpenDiagram,
  onDiagramReady,
  onDiagramUpdateReady,
  onCommentMarkReady,
  onCommentMarkRemoveReady,
  readOnly = false,
  githubRepo,
}: EditorProps) {
  const [ready, setReady] = useState<{ ydoc: Y.Doc; provider: any } | null>(null)
  const providerRef = useRef<any>(null)

  useEffect(() => {
    let cancelled = false
    const ydoc = new Y.Doc()
    new IndexeddbPersistence(documentId, ydoc)

    let syncHandler: ((synced: boolean) => void) | null = null
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null

    import('y-websocket').then((mod: any) => {
      if (cancelled) { ydoc.destroy(); return }

      const provider = new mod.WebsocketProvider(WS_URL, documentId, ydoc)
      providerRef.current = provider

      const color = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)]
      provider.awareness.setLocalStateField('user', {
        id: user.id,
        name: user.name,
        color,
        avatar: user.avatar_url,
      })

      onProviderReady?.(provider)

      // Only mount the editor once Yjs has finished its initial sync.
      // This prevents y-prosemirror's cursor plugin from reading .doc
      // before the Yjs document is populated.
      syncHandler = (synced: boolean) => {
        if (synced && !cancelled) {
          setReady({ ydoc, provider })
        }
      }
      provider.on('sync', syncHandler)

      // Fallback: if the WebSocket server is unreachable (offline / dev),
      // show the editor after 3 s so local IndexedDB content is still editable.
      fallbackTimer = setTimeout(() => {
        if (!cancelled) {
          setReady(prev => prev ?? { ydoc, provider })
        }
      }, 3000)
    })

    return () => {
      cancelled = true
      if (fallbackTimer) clearTimeout(fallbackTimer)
      const provider = providerRef.current
      if (provider && syncHandler) provider.off('sync', syncHandler)
      providerRef.current = null
      setReady(prev => {
        if (prev) {
          prev.provider?.destroy?.()
          prev.ydoc.destroy()
        }
        return null
      })
    }
  }, [documentId, user.id])

  return (
    <div
      id="editor-content"
      style={{
        flex: 1,
        overflowY: 'auto',
        position: 'relative',
        padding: '44px 60px',
        maxWidth: '820px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {!ready ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: 'monospace', paddingTop: 8 }}>
          ◉ connecting...
        </div>
      ) : (
        <TiptapEditor
          key={documentId}
          projectId={documentId}
          ydoc={ready.ydoc}
          readOnly={readOnly}
          githubRepo={githubRepo}
          onWordCount={onWordCount}
          onOpenBrain={onOpenBrain}
          onOpenDiagram={onOpenDiagram}
          onDiagramReady={onDiagramReady}
          onDiagramUpdateReady={onDiagramUpdateReady}
          onCommentMarkReady={onCommentMarkReady}
          onCommentMarkRemoveReady={onCommentMarkRemoveReady}
        />
      )}
    </div>
  )
}