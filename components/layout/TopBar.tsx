'use client'
// components/layout/TopBar.tsx
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/components/ui/Avatar'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { ProfileDropdown } from '@/components/ui/ProfileDropdown'
import { APP_NAME, CURSOR_COLORS } from '@/lib/constants'
import type { User } from '@/types'

interface TopBarProps {
  docTitle: string
  onTitleChange: (title: string) => void
  onlineUsers?: User[]
  onShareClick?: () => void
  onHistoryClick?: () => void
  onCommandClick?: () => void
  onExportMd?: () => void
  onExportPdf?: () => void
  onExportCsv?: () => void
  onGenerateReadme?: () => void
  onDeleteDoc?: () => void
  onGitHubSettings?: () => void
  showDoc?: boolean
}

export function TopBar({
  docTitle,
  onTitleChange,
  onlineUsers = [],
  onShareClick,
  onHistoryClick,
  onCommandClick,
  onExportMd,
  onExportPdf,
  onExportCsv,
  onGenerateReadme,
  onDeleteDoc,
  onGitHubSettings,
  showDoc = true,
}: TopBarProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(docTitle)
  const [exportOpen, setExportOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [exportOpen])

  const commitTitle = () => {
    setEditing(false)
    if (draftTitle.trim()) onTitleChange(draftTitle.trim())
  }

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0 1rem',
        height: '44px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {/* App name */}
      <span
        style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '15px', letterSpacing: '-0.02em', flexShrink: 0 }}
      >
        {APP_NAME}
      </span>

      {/* Back button */}
      <button
        onClick={() => router.back()}
        title="Go back"
        style={{
          background: 'none',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          padding: '3px 8px',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          fontSize: '13px',
          lineHeight: 1,
          flexShrink: 0,
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        ←
      </button>

      {/* Doc title */}
      {showDoc && (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {editing ? (
            <input
              ref={inputRef}
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle()
                if (e.key === 'Escape') { setEditing(false); setDraftTitle(docTitle) }
              }}
              autoFocus
              style={{
                background: 'none',
                border: 'none',
                borderBottom: '1px solid var(--accent)',
                color: 'var(--text-primary)',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '13px',
                outline: 'none',
                width: '100%',
                maxWidth: '300px',
              }}
            />
          ) : (
            <span
              onClick={() => { setDraftTitle(docTitle); setEditing(true) }}
              title="Click to rename"
              style={{
                color: 'var(--text-secondary)',
                fontSize: '13px',
                cursor: 'text',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'block',
                maxWidth: '300px',
              }}
            >
              {docTitle || 'Untitled'}
            </span>
          )}
        </div>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {/* Presence avatars */}
        <div style={{ display: 'flex', gap: '-4px' }}>
          {onlineUsers.slice(0, 5).map((u, i) => (
            <Avatar key={u.id} name={u.name} avatarUrl={u.avatar_url} color={CURSOR_COLORS[i % CURSOR_COLORS.length]} size={24} />
          ))}
        </div>

        {onShareClick && (
          <button onClick={onShareClick} className="helix-hover" style={btnStyle}>↗ share</button>
        )}
        {onHistoryClick && (
          <button onClick={onHistoryClick} className="helix-hover" style={btnStyle}>◷ history</button>
        )}

        {/* Export dropdown */}
        {(onExportMd || onExportPdf || onExportCsv || onGenerateReadme) && (
          <div ref={exportRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setExportOpen((v) => !v)}
              className="helix-hover"
              style={{ ...btnStyle, color: exportOpen ? 'var(--accent)' : 'var(--text-secondary)', borderColor: exportOpen ? 'var(--accent)' : 'var(--border)' }}
              title="Export options"
            >
              ↑ export
            </button>
            {exportOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 6px)',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '4px 0',
                  minWidth: 160,
                  zIndex: 50,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                }}
              >
                {onExportMd && (
                  <button
                    onClick={() => { onExportMd(); setExportOpen(false) }}
                    style={dropItemStyle}
                  >
                    ↓ Markdown
                  </button>
                )}
                {onExportPdf && (
                  <button
                    onClick={() => { onExportPdf(); setExportOpen(false) }}
                    style={dropItemStyle}
                  >
                    ↓ PDF
                  </button>
                )}
                {onExportCsv && (
                  <button
                    onClick={() => { onExportCsv(); setExportOpen(false) }}
                    style={dropItemStyle}
                  >
                    ↓ Kanban CSV
                  </button>
                )}
                {onGenerateReadme && (
                  <button
                    onClick={() => { onGenerateReadme(); setExportOpen(false) }}
                    style={{ ...dropItemStyle, borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 8 }}
                  >
                    ▤ Generate README
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {onDeleteDoc && (
          <button onClick={onDeleteDoc} className="helix-hover" style={{ ...btnStyle, color: 'var(--red)', borderColor: 'var(--red)' }} title="Delete document">⌫ delete</button>
        )}
        {onGitHubSettings && (
          <button onClick={onGitHubSettings} className="helix-hover" style={btnStyle} title="GitHub Integration">◎ github</button>
        )}
        {onCommandClick && (
          <button onClick={onCommandClick} className="helix-hover" style={btnStyle}>⌘K</button>
        )}
        <ThemeToggle />
        <ProfileDropdown />
      </div>
    </header>
  )
}

const btnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  padding: '3px 8px',
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  fontSize: '11px',
  transition: 'all 0.15s ease',
  fontFamily: 'JetBrains Mono, monospace',
}

const dropItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '7px 14px',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: '11px',
  cursor: 'pointer',
}