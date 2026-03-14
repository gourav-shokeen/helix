'use client'
// components/ui/DocumentCard.tsx
import { formatRelativeDate } from '@/lib/utils'
import type { Document } from '@/types'

interface DocumentCardProps {
  doc: Document
  onClick: () => void
  onDelete?: (e: React.MouseEvent) => void
}

const DOC_ICONS: Record<string, string> = {
  document: '◈',
  journal: '◉',
}

export function DocumentCard({ doc, onClick, onDelete }: DocumentCardProps) {
  return (
    <div
      onClick={onClick}
      className="helix-hover"
      style={{
        display: 'grid',
        gridTemplateColumns: onDelete ? '24px 1fr 120px 80px 32px' : '24px 1fr 120px 80px',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.6rem 1rem',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        background: 'transparent',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
        {DOC_ICONS[doc.type] ?? '◈'}
      </span>
      <span
        style={{
          color: 'var(--text-primary)',
          fontSize: '13px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {doc.title || 'Untitled'}
      </span>
      <span style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'right' }}>
        {formatRelativeDate(doc.updated_at)}
      </span>
      <span style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'right' }}>
        {doc.type}
      </span>
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(e) }}
          title="Delete document"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: '13px',
            padding: '2px 4px',
            borderRadius: '3px',
            lineHeight: 1,
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--red)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          ␡
        </button>
      )}
    </div>
  )
}
