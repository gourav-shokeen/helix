'use client'
// components/editor/CommentMark.tsx — Tiptap Mark + Thread Sidebar
import { Mark, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

async function getThreads(docId: string) {
  const supabase = createClient()
  return supabase
    .from('threads')
    .select('*, comments(*)')
    .eq('doc_id', docId)
    .order('created_at', { ascending: true })
}

// ── Tiptap Mark ───────────────────────────────────────────────

export const CommentMarkExtension = Mark.create({
  name: 'commentMark',
  inclusive: false,
  addAttributes() {
    return {
      threadId: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-thread-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-thread-id': HTMLAttributes.threadId,
        class: 'helix-comment-mark',
      }),
    ]
  },

  // Click on a highlighted word → open threads sidebar and activate that thread
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('commentMarkClick'),
        props: {
          handleClick(view, _, event) {
            const target = event.target as HTMLElement
            const el = target.closest('[data-thread-id]') as HTMLElement | null
            const threadId = el?.getAttribute('data-thread-id')
            if (!threadId) return false
            window.dispatchEvent(new CustomEvent('helix:comment:click', { detail: { threadId } }))
            return true
          },
        },
      }),
    ]
  },
})

// ── Types ─────────────────────────────────────────────────────

interface Comment { id: string; body: string; author_id: string; created_at: string }
interface Thread { id: string; anchor_text: string; resolved: boolean; created_at: string; comments: Comment[] }

// ── Floating toolbar that appears on text selection ───────────

interface SelectionToolbarProps {
  onComment: (anchorText: string) => void
}

export function SelectionCommentButton({ onComment }: SelectionToolbarProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [selectedText, setSelectedText] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    const onOpen = () => setModalOpen(true)
    const onClose = () => setModalOpen(false)
    window.addEventListener('helix:diagram:edit', onOpen)
    window.addEventListener('helix:brain:open', onOpen)
    window.addEventListener('helix:modal:close', onClose)
    return () => {
      window.removeEventListener('helix:diagram:edit', onOpen)
      window.removeEventListener('helix:brain:open', onOpen)
      window.removeEventListener('helix:modal:close', onClose)
    }
  }, [])

  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setPos(null)
        return
      }
      const text = sel.toString().trim()
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      setSelectedText(text)
      setPos({ top: rect.top - 36, left: rect.left + rect.width / 2 - 50 })
    }
    document.addEventListener('selectionchange', handler)
    return () => document.removeEventListener('selectionchange', handler)
  }, [])

  if (!pos || modalOpen) return null

  return (
    <div
      className="helix-fade-in"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 300,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '5px',
        padding: '4px 10px',
        pointerEvents: 'auto',
      }}
    >
      <button
        onMouseDown={(e) => { e.preventDefault(); onComment(selectedText); setPos(null) }}
        style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace' }}
      >
        💬 Comment
      </button>
    </div>
  )
}

// ── Thread Sidebar ────────────────────────────────────────────

interface ThreadSidebarProps {
  docId: string
  onHighlightThread: (threadId: string | null) => void
  onThreadResolved?: (threadId: string) => void
  pendingThreadId?: string | null
  onPendingConsumed?: () => void
}

export function ThreadSidebar({ docId, onHighlightThread, onThreadResolved, pendingThreadId, onPendingConsumed }: ThreadSidebarProps) {
  const [threads, setThreads] = useState<Thread[]>([])
  const [activeThread, setActiveThread] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState<Record<string, string>>({})
  const [showResolved, setShowResolved] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const loadThreads = useCallback(async () => {
    if (!docId) return
    const { data } = await getThreads(docId)
    if (data) setThreads(data as Thread[])
  }, [docId])

  useEffect(() => { loadThreads() }, [loadThreads])

  useEffect(() => {
    const refreshHandler = () => loadThreads()
    window.addEventListener('helix:threads:refresh', refreshHandler)
    return () => window.removeEventListener('helix:threads:refresh', refreshHandler)
  }, [loadThreads])

  // Activate thread when triggered by clicking a highlighted word
  useEffect(() => {
    if (!pendingThreadId) return
    setActiveThread(pendingThreadId)
    onHighlightThread(pendingThreadId)
    onPendingConsumed?.()
    // Scroll the thread card into view after render
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-thread-card-id="${pendingThreadId}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }, [pendingThreadId, onHighlightThread, onPendingConsumed])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`threads:${docId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => loadThreads())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'threads', filter: `doc_id=eq.${docId}` }, () => loadThreads())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [docId, supabase, loadThreads])

  const handleAddComment = async (threadId: string) => {
    const body = replyBody[threadId]?.trim()
    if (!body) return
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, body })
      })
      const result = await response.json()
      if (response.ok && result.comment) {
        await loadThreads()
        setReplyBody((prev) => ({ ...prev, [threadId]: '' }))
      }
    } catch (err) {
      console.error('Comment creation error:', err)
    }
  }

  const handleResolve = async (threadId: string) => {
    try {
      const response = await fetch('/api/threads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, resolved: true })
      })
      if (response.ok) {
        await loadThreads()
        onThreadResolved?.(threadId)
        if (activeThread === threadId) { setActiveThread(null); onHighlightThread(null) }
      }
    } catch (err) {
      console.error('Thread resolve error:', err)
    }
  }

  const open = threads.filter((t) => !t.resolved)
  const resolved = threads.filter((t) => t.resolved)
  const visible = showResolved ? [...open, ...resolved] : open

  return (
    <div className="thread-sidebar" style={{ overflowY: 'auto', padding: '0.75rem' }}>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>💬 Threads ({open.length})</span>
        <button
          onClick={() => setShowResolved((v) => !v)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '10px' }}
        >
          {showResolved ? 'hide resolved' : 'show resolved'}
        </button>
      </div>
      {visible.length === 0 && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No threads yet. Select text and click 💬.</div>
      )}
      {visible.map((thread) => {
        const isActive = activeThread === thread.id
        return (
          <div
            key={thread.id}
            data-thread-card-id={thread.id}
            className={`thread-card${isActive ? ' thread-card--active' : ''}${thread.resolved ? ' thread-card--resolved' : ''}`}
            onClick={() => {
              const next = isActive ? null : thread.id
              setActiveThread(next)
              onHighlightThread(next)
            }}
          >
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
              {thread.resolved && <span style={{ color: 'var(--text-muted)', marginRight: '0.4rem' }}>✓ resolved</span>}
              {new Date(thread.created_at).toLocaleDateString()}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--accent)', marginBottom: '0.4rem', fontStyle: 'italic' }}>
              &quot;{thread.anchor_text.slice(0, 60)}{thread.anchor_text.length > 60 ? '…' : ''}&quot;
            </div>
            {isActive && (
              <div style={{ marginTop: '0.5rem' }}>
                {thread.comments.map((c) => (
                  <div key={c.id} style={{ marginBottom: '0.4rem', padding: '0.3rem 0.5rem', background: 'var(--bg)', borderRadius: '3px', fontSize: '11px', color: 'var(--text-primary)' }}>
                    {c.body}
                    <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>{new Date(c.created_at).toLocaleString()}</div>
                  </div>
                ))}
                <textarea
                  value={replyBody[thread.id] ?? ''}
                  onChange={(e) => setReplyBody((p) => ({ ...p, [thread.id]: e.target.value }))}
                  placeholder="Reply…"
                  rows={2}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', outline: 'none', padding: '0.3rem', resize: 'none', marginTop: '0.4rem' }}
                />
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAddComment(thread.id) }}
                    style={{ background: 'var(--accent)', border: 'none', borderRadius: '3px', color: 'var(--status-text)', cursor: 'pointer', fontSize: '10px', fontWeight: 700, padding: '0.25rem 0.6rem' }}
                  >
                    Reply
                  </button>
                  {!thread.resolved && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleResolve(thread.id) }}
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '10px', padding: '0.25rem 0.6rem' }}
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Hook to create a new thread from a selection ──────────────

export function useCreateThread(docId: string) {
  return useCallback(async (anchorText: string): Promise<string | null> => {
    try {
      const response = await fetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_id: docId, anchor_text: anchorText })
      })
      const result = await response.json()
      if (!response.ok) {
        console.error('Thread creation failed:', result.error)
        return null
      }
      return result.thread?.id ?? null
    } catch (err) {
      console.error('Thread creation error:', err)
      return null
    }
  }, [docId])
}