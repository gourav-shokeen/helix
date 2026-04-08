'use client'
// components/ui/ShareModal.tsx
import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'

interface ShareModalProps {
  docId: string
  isPublic: boolean
  onClose: () => void
}

export function ShareModal({ docId, onClose }: ShareModalProps) {
  const user = useAuthStore((s) => s.user)
  const [linkLoading, setLinkLoading] = useState(false)
  const [generatedLink, setGeneratedLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [linkError, setLinkError] = useState('')

  const handleGenerateLink = async () => {
    if (!user) return
    setLinkLoading(true)
    setLinkError('')
    setGeneratedLink('')
    try {
      const response = await fetch('/api/share/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId, permission: 'edit' })
      })
      const result = await response.json()
      if (!response.ok) {
        setLinkError(result.error || 'Failed to generate link')
        return
      }
      setGeneratedLink(result.shareUrl)
    } catch (err) {
      console.error('Generate link error:', err)
      setLinkError('Failed to generate link. Try again.')
    } finally {
      setLinkLoading(false)
    }
  }

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
      onClick={onClose}
    >
      <div
        className="helix-fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.5rem', width: '420px', maxWidth: '90vw' }}
      >
        <h3 style={{ color: 'var(--text-primary)', marginBottom: '1.25rem', fontSize: '14px' }}>↗ Share Document</h3>

        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          Generate a link that lets collaborators edit this document.
        </div>

        <button
          onClick={handleGenerateLink}
          disabled={linkLoading}
          style={{ background: 'var(--accent)', border: 'none', borderRadius: '4px', color: 'var(--status-text)', cursor: 'pointer', fontSize: '12px', fontWeight: 700, padding: '0.35rem 0.85rem', opacity: linkLoading ? 0.6 : 1 }}
        >
          {linkLoading ? 'Generating…' : 'Generate edit link'}
        </button>

        {linkError && <div style={{ fontSize: '11px', color: 'var(--red)', marginTop: '0.4rem' }}>{linkError}</div>}

        {generatedLink && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.4rem 0.6rem', fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans), system-ui, sans-serif' }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{generatedLink}</span>
              <span style={{ fontSize: '10px', background: 'var(--orange)', color: 'var(--status-text)', padding: '1px 5px', borderRadius: '3px', fontWeight: 700, flexShrink: 0 }}>
                edit
              </span>
            </div>
            <button onClick={() => handleCopy(generatedLink)} style={copyBtnStyle}>
              {copied ? '✓ Copied!' : 'Copy link'}
            </button>
          </div>
        )}

        <div style={{ marginTop: '1rem' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.4rem 1rem', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

const copyBtnStyle: React.CSSProperties = {
  marginTop: '0.4rem',
  background: 'var(--accent-dim)',
  border: '1px solid var(--accent)',
  borderRadius: '4px',
  padding: '0.25rem 0.65rem',
  color: 'var(--accent)',
  cursor: 'pointer',
  fontSize: '11px',
}