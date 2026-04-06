'use client'
// app/(app)/dashboard/page.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { DocumentCard } from '@/components/ui/DocumentCard'
import { TopBar } from '@/components/layout/TopBar'
import type { Document } from '@/types'
import { APP_NAME } from '@/lib/constants'

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [docs, setDocs] = useState<Document[]>([])
  const [fetching, setFetching] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  // Ref guard: only fetch once per unique user ID.
  // Prevents re-triggering even if React Strict Mode or session polling
  // causes the effect to fire more than once with the same user.id.
  const lastFetchedIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!user?.id) return
    if (lastFetchedIdRef.current === user.id) return   // already fetched for this user
    lastFetchedIdRef.current = user.id
    setFetching(true)
    fetch('/api/documents?type=document')
      .then((r) => r.json())
      .then(({ documents }) => {
        setDocs((documents as Document[]) ?? [])
        setFetching(false)
      })
      .catch(() => setFetching(false))
  }, [user?.id])

  const handleNewDoc = useCallback(async () => {
    if (!user || creating) return
    const input = window.prompt('Document name:')
    if (input === null) return
    const title = input.trim() || 'Untitled'
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, type: 'document' }),
      })
      const json = await res.json()
      if (!res.ok || !json.document) {
        setCreateError(`Failed to create document: ${json.error ?? 'Unknown error'}`)
        setCreating(false)
        return
      }
      router.push(`/doc/${json.document.id}`)
    } catch (err) {
      setCreateError('Failed to create document. Check console for details.')
      console.error('[dashboard] createDocument error:', err)
      setCreating(false)
    }
  }, [user, router, creating])

  const handleDelete = useCallback(async (docId: string, title: string) => {
    if (!confirm(`Delete "${title || 'Untitled'}"? This cannot be undone.`)) return
    await fetch(`/api/documents?id=${docId}`, { method: 'DELETE' })
    setDocs((prev) => prev.filter((d) => d.id !== docId))
  }, [])

  if (loading || !user) return null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <TopBar
        docTitle=""
        onTitleChange={() => {}}
        showDoc={false}
        onCommandClick={() => {}}
      />

      <main style={{ flex: 1, maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem', width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
              ⬡ {APP_NAME}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              Welcome back, {user.name}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
            <button
              onClick={handleNewDoc}
              disabled={creating}
              style={{
                background: 'var(--accent)',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                color: 'var(--status-text)',
                fontWeight: 700,
                fontSize: '12px',
                cursor: creating ? 'not-allowed' : 'pointer',
                fontFamily: 'JetBrains Mono, monospace',
                opacity: creating ? 0.6 : 1,
                transition: 'opacity 0.15s ease',
              }}
            >
              {creating ? 'creating...' : '+ New Document'}
            </button>
            {createError && (
              <span style={{ color: 'var(--red)', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}>
                ⚠ {createError}
              </span>
            )}
          </div>
        </div>

        {/* Table header */}
        <div
          className="dashboard-grid"
          style={{
            padding: '0.4rem 1rem',
            borderBottom: '1px solid var(--border)',
            fontSize: '10px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          <span />
          <span>Title</span>
          <span className="dashboard-col-date" style={{ textAlign: 'right' }}>Last edited</span>
          <span className="dashboard-col-type" style={{ textAlign: 'right' }}>Type</span>
          <span />
        </div>

        {/* Doc list */}
        <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 6px 6px', overflow: 'hidden' }}>
          {fetching ? (
            // Skeleton shimmer
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>
                <div className="skeleton" style={{ height: '14px', width: `${60 + Math.random() * 30}%` }} />
              </div>
            ))
          ) : docs.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              ◈ No documents yet. Create your first one →
            </div>
          ) : (
            docs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                onClick={() => router.push(`/doc/${doc.id}`)}
                onDelete={() => handleDelete(doc.id, doc.title)}
              />
            ))
          )}
        </div>
      </main>
    </div>
  )
}
