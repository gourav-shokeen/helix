'use client'
// components/editor/EditorWrapper.tsx
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Editor } from './Editor'
import { SelectionCommentButton, ThreadSidebar, useCreateThread } from './CommentMark'
import type { User } from '@/types'

const DiagramModal = dynamic(() => import('./DiagramModal').then((mod) => mod.DiagramModal), { ssr: false })

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
  const [diagramOpen, setDiagramOpen] = useState(false)
  const [diagramEditing, setDiagramEditing] = useState<{ id: string; dsl: string } | null>(null)
  const insertDiagramRef = useRef<((syntax: string) => void) | null>(null)
  const updateDiagramRef = useRef<((id: string, dsl: string) => void) | null>(null)
  const [threadsOpen, setThreadsOpen] = useState(false)
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null)

  useEffect(() => {
    if (isFocused) setThreadsOpen(false)
  }, [isFocused])

  // Clicking a highlighted comment mark → open threads + activate that thread
  useEffect(() => {
    const handler = (e: Event) => {
      const { threadId } = (e as CustomEvent<{ threadId: string }>).detail
      setThreadsOpen(true)
      setPendingThreadId(threadId)
    }
    window.addEventListener('helix:comment:click', handler)
    return () => window.removeEventListener('helix:comment:click', handler)
  }, [])

  const createThread = useCreateThread(documentId)

  const handleOpenDiagram = useCallback(() => {
    setDiagramEditing(null)
    setDiagramOpen(true)
  }, [])

  // ✅ FIX: stable useCallback so the ref-setter identity never changes between renders,
  //    preventing the onDiagramReady effect in Editor.tsx from re-firing with a stale closure.
  const handleDiagramReady = useCallback((fn: (syntax: string) => void) => {
    insertDiagramRef.current = fn
  }, [])

  const handleDiagramUpdateReady = useCallback((fn: (id: string, dsl: string) => void) => {
    updateDiagramRef.current = fn
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

  const applyCommentMarkRef = useRef<((threadId: string, from: number, to: number) => void) | null>(null)
  const removeCommentMarkRef = useRef<((threadId: string) => void) | null>(null)
  const captureSelectionRef = useRef<(() => { from: number; to: number } | null) | null>(null)

  const handleComment = useCallback(async (anchorText: string) => {
    const range = captureSelectionRef.current?.()
    if (!range || range.from === range.to) return
    const threadId = await createThread(anchorText)
    if (!threadId) return
    applyCommentMarkRef.current?.(threadId, range.from, range.to)
    setThreadsOpen(true)
    window.dispatchEvent(new CustomEvent('helix:threads:refresh'))
  }, [createThread])

  const threadsBtnRight = threadsOpen ? '284px' : '4px'

  return (
    <div
      className={threadsOpen ? 'threads-mobile-open' : ''}
      style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', position: 'relative' }}>
        <Editor
          documentId={documentId}
          user={user}
          onWordCount={onWordCount}
          onProviderReady={onProviderReady}
          onOpenDiagram={handleOpenDiagram}
          onDiagramReady={handleDiagramReady}
          onDiagramUpdateReady={handleDiagramUpdateReady}
          onCommentMarkReady={(fn) => { applyCommentMarkRef.current = fn }}
          onCommentMarkRemoveReady={(fn) => { removeCommentMarkRef.current = fn }}
          onCaptureSelectionReady={(fn) => { captureSelectionRef.current = fn }}
          readOnly={readOnly}
          githubRepo={githubRepo}
        />
        <SelectionCommentButton onComment={handleComment} />
      </div>

      {/* Thread sidebar toggle */}
      <button
        onClick={() => setThreadsOpen((v) => !v)}
        className="threads-toggle-btn"
        style={{
          position: 'absolute',
          right: threadsBtnRight,
          top: '80px',
          zIndex: 20,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '3px',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: '10px',
          padding: '4px 3px',
          writingMode: 'vertical-rl',
          transition: 'right 0.25s ease',
        }}
      >
        {threadsOpen ? '▶' : '◀'} threads
      </button>

      {threadsOpen && (
        <ThreadSidebar
          docId={documentId}
          onThreadResolved={(threadId) => { removeCommentMarkRef.current?.(threadId) }}
          onHighlightThread={(id) => {
            if (id) {
              const el = document.querySelector(`[data-thread-id="${id}"]`)
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
          }}
          pendingThreadId={pendingThreadId}
          onPendingConsumed={() => setPendingThreadId(null)}
        />
      )}

      {diagramOpen && (
        <DiagramModal
          onInsert={handleInsertDiagram}
          initialDsl={diagramEditing?.dsl}
          mode={diagramEditing ? 'update' : 'insert'}
          onClose={() => { setDiagramOpen(false); setDiagramEditing(null) }}
        />
      )}
    </div>
  )
}