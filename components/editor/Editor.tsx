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
import { getSession } from 'next-auth/react'
import type { User } from '@/types'
import Highlight from '@tiptap/extension-highlight'

// ✅ Toolbar — inlined, uses Helix CSS variables from globals.css
function EditorToolbar({ editor }: { editor: any }) {
  if (!editor) return null

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 12,
    fontFamily: 'JetBrains Mono, monospace',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'var(--accent)' : 'var(--surface-hover)',
    color: active ? 'var(--status-text)' : 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  })
  const md = (e: React.MouseEvent) => e.preventDefault()

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 4,
      padding: '6px 12px',
      borderBottom: '1px solid var(--border)',
      backgroundColor: 'var(--surface)',
    }}>
      <button onMouseDown={md} onClick={() => editor.chain().focus().toggleBold().run()}
        style={{...btnStyle(editor.isActive('bold')), fontWeight:700}} title="Bold (⌘B)">B</button>

      <button onMouseDown={md} onClick={() => editor.chain().focus().toggleItalic().run()}
        style={{...btnStyle(editor.isActive('italic')), fontStyle:'italic'}} title="Italic (⌘I)">I</button>

      <button onMouseDown={md} onClick={() => editor.chain().focus().toggleHighlight().run()}
        style={btnStyle(editor.isActive('highlight'))} title="Highlight">
        <span style={{borderBottom: '2px solid currentColor'}}>H</span>
      </button>

      <div style={{width:1, height:16, background:'var(--border-light)', margin:'0 4px'}} />

      {([1,2,3] as const).map(level => (
        <button key={level} onMouseDown={md}
          onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
          style={btnStyle(editor.isActive('heading', { level }))}
          title={`Heading ${level} (⌘⌥${level})`}>
          H{level}
        </button>
      ))}

      <button onMouseDown={md} onClick={() => editor.chain().focus().setParagraph().run()}
        style={btnStyle(editor.isActive('paragraph'))} title="Normal text">¶</button>
    </div>
  )
}

interface EditorProps {
  documentId: string
  user: User
  onWordCount?: (count: number) => void
  onProviderReady?: (provider: unknown) => void
  onOpenBrain?: () => void
  onOpenDiagram?: () => void
  onDiagramReady?: (fn: (syntax: string) => void) => void
  onDiagramUpdateReady?: (fn: (id: string, dsl: string) => void) => void
  onCommentMarkReady?: (fn: (threadId: string, from: number, to: number) => void) => void
  onCommentMarkRemoveReady?: (fn: (threadId: string) => void) => void
  onCaptureSelectionReady?: (fn: () => { from: number; to: number } | null) => void
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
  onCaptureSelectionReady,
  editorRef,
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
  onCommentMarkReady?: (fn: (threadId: string, from: number, to: number) => void) => void
  onCommentMarkRemoveReady?: (fn: (threadId: string) => void) => void
  onCaptureSelectionReady?: (fn: () => { from: number; to: number } | null) => void
  editorRef?: React.MutableRefObject<any>
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
      // ✅ CHANGE 2: Added heading levels to existing StarterKit config
      StarterKit.configure({
        codeBlock: false,
        heading: {
          levels: [1, 2, 3],
        },
      }),
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
      // ✅ CHANGE 3: Added Highlight to the extensions array (was imported but unused)
      Highlight.configure({ multicolor: false }),
    ],
    editable: !readOnly,
    editorProps: {
      attributes: { class: 'tiptap-editor' },
    },
    onUpdate: handleUpdate,
  })

  // Expose editor instance upward so the outer div's onClick can call focus()
  useEffect(() => {
    if (editorRef) editorRef.current = editor
  }, [editor, editorRef])

  // README import from localStorage (set by handleImportReadme in doc page)
  useEffect(() => {
    if (!editor) return
    const key = `helix_readme_import_${projectId}`
    const markdown = localStorage.getItem(key)
    if (!markdown) return
    localStorage.removeItem(key)
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

  // Brain panel → insert file content into editor
  useEffect(() => {
    if (!editor) return
    const handler = (e: Event) => {
      const content = (e as CustomEvent<{ content: string }>).detail?.content
      if (!content) return
      editor.chain().focus().insertContent(content).run()
    }
    window.addEventListener('helix:editor:insert', handler)
    return () => window.removeEventListener('helix:editor:insert', handler)
  }, [editor])

  // Expose editor JSON for DOCX export
  useEffect(() => {
    if (!editor) return
    const handler = () => {
      const json = editor.getJSON()
      // Collect kanban boardIds directly from ProseMirror doc state
      const kanbanBoards: Record<number, string> = {}
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'kanbanBlock' && node.attrs?.boardId) {
          kanbanBoards[pos] = node.attrs.boardId
        }
      })
      const boardIds = Object.values(kanbanBoards)
      window.dispatchEvent(new CustomEvent('helix:editor:json', { detail: { json, boardIds } }))
    }
    window.addEventListener('helix:editor:requestjson', handler)
    return () => window.removeEventListener('helix:editor:requestjson', handler)
  }, [editor])

  // ✅ FIX: capture editor in a local variable so the closure is never stale,
  //    and guard against null before calling chain(). Because onDiagramReady is
  //    now a stable useCallback in EditorWrapper, this effect only fires once
  //    when the editor is first ready — not on every parent re-render.
  useEffect(() => {
    if (!editor || !onDiagramReady) return
    const capturedEditor = editor
    onDiagramReady((syntax: string) => {
      if (!capturedEditor) return
      capturedEditor.chain().focus().insertContent({
        type: 'diagram',
        attrs: {
          dsl: syntax,
          id: crypto.randomUUID(),
        },
      }).run()
    })
  }, [editor, onDiagramReady])

  useEffect(() => {
    if (!editor || !onDiagramUpdateReady) return
    const capturedEditor = editor
    onDiagramUpdateReady((id: string, dsl: string) => {
      if (!capturedEditor) return
      const { state, view } = capturedEditor
      let tr = state.tr
      state.doc.descendants((pmNode: ProseMirrorNode, pos: number) => {
        if (pmNode.type.name !== 'diagram') return
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

  // Expose a function to capture the current selection SYNCHRONOUSLY
  useEffect(() => {
    if (!editor || !onCaptureSelectionReady) return
    onCaptureSelectionReady(() => {
      const { from, to } = editor.state.selection
      if (from === to) return null
      return { from, to }
    })
  }, [editor, onCaptureSelectionReady])

  // Apply comment mark using explicit from/to — never touches current selection
  useEffect(() => {
    if (!editor || !onCommentMarkReady) return
    onCommentMarkReady((threadId: string, from: number, to: number) => {
      const { state, view } = editor
      const markType = state.schema.marks.commentMark
      if (!markType) return
      const mark = markType.create({ threadId })
      const tr = state.tr.addMark(from, to, mark)
      view.dispatch(tr)
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
      {/* ✅ CHANGE 4: Toolbar rendered above EditorContent, hidden in readOnly mode */}
      {!readOnly && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} style={{ width: '100%' }} />
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
  onCaptureSelectionReady,
  readOnly = false,
  githubRepo,
}: EditorProps) {
  const [ready, setReady] = useState<{ ydoc: Y.Doc; provider: any } | null>(null)
  const providerRef = useRef<any>(null)
  // Ref to access the tiptap editor instance from the outer div's onClick
  const editorRef = useRef<any>(null)

  useEffect(() => {
    let cancelled = false
    const ydoc = new Y.Doc()
    new IndexeddbPersistence(documentId, ydoc)

    let syncHandler: ((synced: boolean) => void) | null = null
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null

    import('y-websocket').then(async (mod: any) => {
      if (cancelled) { ydoc.destroy(); return }

      // The user ID is passed via y-websocket's `params` option, NOT by
      // appending a query string to the base WS_URL. y-websocket builds the
      // final URL as: serverUrl + '/' + roomname + '?' + params
      // If we append ?user=xxx to serverUrl BEFORE y-websocket adds the room
      // name, the URL becomes malformed (ws://host?user=xxx/room-id) and the
      // server's URL parser sees pathname='/' → falls back to room 'default'.
      const wsParams: Record<string, string> = {}
      try {
        const session = await getSession()
        if (session?.user?.id) {
          wsParams.user = session.user.id
        }
      } catch { /* non-fatal */ }

      // Room name = documentId → unique isolated room per document.
      // y-websocket final URL: ws://host:1234/<documentId>?user=<userId>
      const provider = new mod.WebsocketProvider(WS_URL, documentId, ydoc, {
        params: wsParams,
      })
      providerRef.current = provider

      const color = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)]
      provider.awareness.setLocalStateField('user', {
        id: user.id,
        name: user.name,
        color,
        avatar: user.avatar_url,
      })

      onProviderReady?.(provider)

      syncHandler = (synced: boolean) => {
        if (synced && !cancelled) {
          setReady({ ydoc, provider })
        }
      }
      provider.on('sync', syncHandler)

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
        width: '100%',
        boxSizing: 'border-box',
        scrollbarWidth: 'none',
        cursor: 'text',
      } as React.CSSProperties}
      onClick={(e) => {
        // Fire only when clicking the bare background (dead zone), not editor content
        if (e.target === e.currentTarget && editorRef.current) {
          editorRef.current.commands.focus('end')
        }
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
          onCaptureSelectionReady={onCaptureSelectionReady}
          editorRef={editorRef}
        />
      )}
    </div>
  )
}