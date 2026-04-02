'use client'
// components/layout/Sidebar.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Document, GitHubCommit } from '@/types'

interface SidebarProps {
  docs: Document[]
  activeDocId?: string
  onNewDoc: () => void
  githubRepo?: string | null
  onImportReadme?: () => void
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ docs, activeDocId, onNewDoc, githubRepo, onImportReadme, mobileOpen = false, onMobileClose }: SidebarProps) {
  const router = useRouter()

  const [commits, setCommits] = useState<GitHubCommit[]>([])
  const [commitsOpen, setCommitsOpen] = useState(true)
  const [commitsLoading, setCommitsLoading] = useState(false)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchCommits = useCallback(async () => {
    if (!githubRepo) return
    setCommitsLoading(true)
    try {
      const res = await fetch(`/api/github/commits?repo=${encodeURIComponent(githubRepo)}&limit=10`)
      if (res.ok) {
        const { commits: data } = await res.json() as { commits: GitHubCommit[] }
        setCommits(data ?? [])
      }
    } finally {
      setCommitsLoading(false)
    }
  }, [githubRepo])

  useEffect(() => {
    if (!githubRepo) return
    fetchCommits()
    refreshTimerRef.current = setInterval(fetchCommits, 5 * 60 * 1000)
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    }
  }, [githubRepo, fetchCommits])

  return (
    <>
      <div
        className={`sidebar-backdrop${mobileOpen ? ' is-open' : ''}`}
        onClick={onMobileClose}
      />
      <aside
        className={`helix-sidebar${mobileOpen ? ' is-open' : ''}`}
        style={{
          height: '100%',
          borderRight: '1px solid var(--border)',
          background: 'var(--surface)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
      {/* New doc button */}
      <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '4px' }}>
        <button
          onClick={onNewDoc}
          style={{
            flex: 1,
            padding: '0.4rem 0.5rem',
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent)',
            borderRadius: '4px',
            color: 'var(--accent)',
            fontSize: '12px',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'JetBrains Mono, monospace',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          + new doc
        </button>
        {githubRepo && onImportReadme && (
          <button
            onClick={onImportReadme}
            title={`Import README from ${githubRepo}`}
            style={{
              padding: '0.4rem 0.5rem',
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text-muted)',
              fontSize: '11px',
              cursor: 'pointer',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            ↓ README
          </button>
        )}
      </div>

      {/* Doc list */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '0.25rem 0' }}>
        {docs.map((doc) => (
          <button
            key={doc.id}
            onClick={() => router.push(`/doc/${doc.id}`)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.4rem 0.75rem',
              background: doc.id === activeDocId ? 'var(--accent-dim)' : 'none',
              borderLeft: doc.id === activeDocId ? '2px solid var(--accent)' : '2px solid transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '12px',
              color: doc.id === activeDocId ? 'var(--accent)' : 'var(--text-secondary)',
              fontFamily: 'JetBrains Mono, monospace',
              transition: 'all 0.15s',
              overflow: 'hidden',
            }}
            onMouseEnter={(e) => {
              if (doc.id !== activeDocId) e.currentTarget.style.background = 'var(--surface-hover)'
            }}
            onMouseLeave={(e) => {
              if (doc.id !== activeDocId) e.currentTarget.style.background = 'none'
            }}
          >
            <span style={{ flexShrink: 0 }}>◈</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {doc.title || 'Untitled'}
            </span>
          </button>
        ))}
      </nav>

      {/* Recent Commits feed */}
      {githubRepo && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            maxHeight: commitsOpen ? '200px' : '28px',
            transition: 'max-height 0.2s ease',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 0.75rem',
              height: '28px',
              cursor: 'pointer',
              fontSize: '10px',
              color: 'var(--text-muted)',
              userSelect: 'none',
              gap: '4px',
            }}
            onClick={() => setCommitsOpen(v => !v)}
          >
            <span style={{ transform: commitsOpen ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s', fontSize: '9px' }}>▶</span>
            <span style={{ flex: 1 }}>Recent Commits</span>
            {commitsLoading && <span style={{ fontSize: '9px' }}>…</span>}
            <button
              onClick={(e) => { e.stopPropagation(); fetchCommits() }}
              title="Refresh"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', padding: 0 }}
            >
              ↻
            </button>
          </div>
          {commitsOpen && (
            <div style={{ overflowY: 'auto', maxHeight: '172px' }}>
              {commits.length === 0 && !commitsLoading && (
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '4px 12px', margin: 0 }}>No commits found.</p>
              )}
              {commits.map((c) => (
                <a
                  key={c.sha}
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '6px',
                    padding: '4px 12px',
                    textDecoration: 'none',
                    borderLeft: '2px solid transparent',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                >
                  <span style={{ color: 'var(--accent)', fontSize: '9px', marginTop: 2, flexShrink: 0 }}>●</span>
                  <div style={{ overflow: 'hidden' }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: 'var(--accent)', display: 'block' }}>
                      {c.sha}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '1.3' }}>
                      {c.message}
                    </span>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                      {c.author} · {relTime(c.date)}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
    </>
  )
}

function relTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}