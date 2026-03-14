'use client'
// components/editor/EditorWrapper.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { Editor } from './Editor'
import { BrainPanel } from './BrainPanel'
import { EmojiReactions } from './EmojiReactions'
import { DiagramModal } from './DiagramModal'
import { SelectionCommentButton, ThreadSidebar, useCreateThread } from './CommentMark'
import type { User } from '@/types'

interface EditorWrapperProps {
  documentId: string
  user: User
  onWordCount?: (count: number) => void
  onProviderReady?: (provider: unknown) => void
  readOnly?: boolean
  isFocused?: boolean
  githubRepo?: string | null
}

export function EditorWrapper({ documentId, user, onWordCount, onProviderReady, readOnly, isFocused, githubRepo }: EditorWrapperProps) {
  const [brainOpen, setBrainOpen] = useState(false)
  const [diagramOpen, setDiagramOpen] = useState(false)
  const [diagramEditing, setDiagramEditing] = useState<{ id: string; dsl: string } | null>(null)
  const [docContent, setDocContent] = useState('')
  const insertDiagramRef = useRef<((syntax: string) => void) | null>(null)
  const updateDiagramRef = useRef<((id: string, dsl: string) => void) | null>(null)
  const [threadsOpen, setThreadsOpen] = useState(false)

  // Close thread panel in focus mode
  useEffect(() => {
    if (isFocused) setThreadsOpen(false)
  }, [isFocused])

  // ⌘⇧B global shortcut → open Brain panel
  useEffect(() => {
    const handler = () => { setBrainOpen(true) }
    window.addEventListener('helix:brain:open', handler)
    return () => window.removeEventListener('helix:brain:open', handler)
  }, [])
  const createThread = useCreateThread(documentId)

  const handleOpenBrain = useCallback(() => {
    const el = document.querySelector('.tiptap-editor')
    setDocContent(el?.textContent ?? '')
    setBrainOpen(true)
  }, [])

  const handleOpenDiagram = useCallback(() => {
    setDiagramEditing(null)
    setDiagramOpen(true)
  }, [])

  const handleInsertDiagram = useCallback((syntax: string) => {
    if (diagramEditing?.id) {
      updateDiagramRef.current?.(diagramEditing.id, syntax)
      return
    }
    insertDiagramRef.current?.(syntax)
  }, [diagramEditing])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; dsl: string }>).detail
      if (!detail?.id) return
      setDiagramEditing({ id: detail.id, dsl: detail.dsl || '' })
      setDiagramOpen(true)
    }
    window.addEventListener('helix:diagram:edit', handler)
    return () => window.removeEventListener('helix:diagram:edit', handler)
  }, [])

  const handleComment = useCallback(async (anchorText: string) => {
    const threadId = await createThread(anchorText)
    if (!threadId) return
    applyCommentMarkRef.current?.(threadId)
    window.dispatchEvent(new CustomEvent('helix:threads:refresh'))
  }, [createThread])

  // Ref to call editor.chain().setMark after threadId is known
  const applyCommentMarkRef = useRef<((threadId: string) => void) | null>(null)
  const removeCommentMarkRef = useRef<((threadId: string) => void) | null>(null)

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', position: 'relative' }}>
        <Editor
          documentId={documentId}
          user={user}
          onWordCount={onWordCount}
          onProviderReady={onProviderReady}
          onOpenBrain={handleOpenBrain}
          onOpenDiagram={handleOpenDiagram}
          onDiagramReady={(fn) => { insertDiagramRef.current = fn }}
          onDiagramUpdateReady={(fn) => { updateDiagramRef.current = fn }}
          onCommentMarkReady={(fn) => { applyCommentMarkRef.current = fn }}
          onCommentMarkRemoveReady={(fn) => { removeCommentMarkRef.current = fn }}
          readOnly={readOnly}
          githubRepo={githubRepo}
        />
        <SelectionCommentButton onComment={handleComment} />
        <div style={{ position: 'absolute', bottom: '12px', right: threadsOpen ? '296px' : '16px', zIndex: 10, transition: 'right 0.25s ease' }}>
          <EmojiReactions docId={documentId} />
        </div>
      </div>

      {/* Thread sidebar toggle */}
      <button
        onClick={() => setThreadsOpen((v) => !v)}
        style={{ position: 'absolute', right: threadsOpen ? '284px' : '4px', top: '50%', transform: 'translateY(-50%)', zIndex: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '10px', padding: '4px 3px', writingMode: 'vertical-rl', transition: 'right 0.25s ease' }}
      >
        {threadsOpen ? '▶' : '◀'} threads
      </button>

      {threadsOpen && (
        <ThreadSidebar
          docId={documentId}
          onThreadResolved={(threadId) => {
            removeCommentMarkRef.current?.(threadId)
          }}
          onHighlightThread={(id) => {
            // Scroll editor to first element with matching data-thread-id
            if (id) {
              const el = document.querySelector(`[data-thread-id="${id}"]`)
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
          }}
        />
      )}

      {brainOpen && (
        <BrainPanel onClose={() => setBrainOpen(false)} docContent={docContent} />
      )}
      {diagramOpen && (
        <DiagramModal
          onInsert={handleInsertDiagram}
          initialDsl={diagramEditing?.dsl}
          mode={diagramEditing ? 'update' : 'insert'}
          onClose={() => {
            setDiagramOpen(false)
            setDiagramEditing(null)
          }}
        />
      )}
    </div>
  )
}
