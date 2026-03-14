'use client'
// app/(app)/dashboard/page.tsx
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createDocument, getMyDocuments, deleteDocument } from '@/lib/supabase/documents'
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

  useEffect(() => {
    if (!user) return
    setFetching(true)
    getMyDocuments(user.id).then(({ data }) => {
      setDocs((data as Document[]) ?? [])
      setFetching(false)
    })
  }, [user])

  const handleNewDoc = useCallback(async () => {
    if (!user || creating) return
    console.log('userId at click:', user.id)
    setCreating(true)
    setCreateError(null)
    const { data, error } = await createDocument(user.id, 'document')
    if (error || !data) {
      console.error('createDocument error:', JSON.stringify(error, null, 2))
      setCreateError(`Failed to create document${error?.message ? `: ${error.message}` : '. Check console for details.'}`)
      setCreating(false)
      return
    }
    router.push(`/doc/${data.id}`)
  }, [user, router, creating])

  const handleDelete = useCallback(async (docId: string, title: string) => {
    if (!confirm(`Delete "${title || 'Untitled'}"? This cannot be undone.`)) return
    await deleteDocument(docId)
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
          style={{
            display: 'grid',
            gridTemplateColumns: '24px 1fr 120px 80px 32px',
            gap: '0.75rem',
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
          <span style={{ textAlign: 'right' }}>Last edited</span>
          <span style={{ textAlign: 'right' }}>Type</span>
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
