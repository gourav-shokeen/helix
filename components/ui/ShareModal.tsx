'use client'
// components/ui/ShareModal.tsx
import { useState } from 'react'
import { makeDocumentPublic } from '@/lib/supabase/documents'
import { useAuthStore } from '@/store/authStore'

interface ShareModalProps {
  docId: string
  isPublic: boolean
  onClose: () => void
}

type Permission = 'view' | 'edit'

export function ShareModal({ docId, isPublic, onClose }: ShareModalProps) {
  const user = useAuthStore((s) => s.user)
  const [pub, setPub] = useState(isPublic)
  const [pubLoading, setPubLoading] = useState(false)
  const [permission, setPermission] = useState<Permission>('view')
  const [linkLoading, setLinkLoading] = useState(false)
  const [generatedLink, setGeneratedLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [linkError, setLinkError] = useState('')

  const publicBaseUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')
  const publicUrl = `${publicBaseUrl}/share/${docId}`

  const togglePublic = async () => {
    setPubLoading(true)
    const next = !pub
    await makeDocumentPublic(docId, next)
    setPub(next)
    setPubLoading(false)
  }

  const handleGenerateLink = async () => {
    if (!user) return
    setLinkLoading(true)
    setLinkError('')
    setGeneratedLink('')
    
    try {
      const response = await fetch('/api/share/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId, permission })
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

        {/* ── Public toggle ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Make public</span>
          <button
            onClick={togglePublic}
            disabled={pubLoading}
            style={{ background: pub ? 'var(--accent)' : 'var(--surface-hover)', border: 'none', borderRadius: '12px', width: '40px', height: '22px', cursor: 'pointer', transition: 'background 0.15s ease', position: 'relative' }}
          >
            <span style={{ position: 'absolute', top: '3px', left: pub ? '20px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.15s ease' }} />
          </button>
        </div>
        {pub && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.4rem 0.6rem', fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace', wordBreak: 'break-all' }}>
              {publicUrl}
            </div>
            <button onClick={() => handleCopy(publicUrl)} style={copyBtnStyle}>
              Copy public link
            </button>
          </div>
        )}

        {/* ── Divider ── */}
        <div style={{ borderTop: '1px solid var(--border)', margin: '0.75rem 0' }} />

        {/* ── Token link section ── */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '0.6rem', fontWeight: 600 }}>Share with permission</div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {(['view', 'edit'] as Permission[]).map((p) => (
              <button
                key={p}
                onClick={() => { setPermission(p); setGeneratedLink('') }}
                style={{
                  padding: '0.3rem 0.75rem',
                  borderRadius: '4px',
                  border: permission === p ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: permission === p ? 'var(--accent-dim)' : 'var(--surface-hover)',
                  color: permission === p ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                {p === 'view' ? '👁 View only' : '✏ Can edit'}
              </button>
            ))}
          </div>
          <button
            onClick={handleGenerateLink}
            disabled={linkLoading}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: '4px', color: 'var(--status-text)', cursor: 'pointer', fontSize: '12px', fontWeight: 700, padding: '0.35rem 0.85rem', opacity: linkLoading ? 0.6 : 1 }}
          >
            {linkLoading ? 'Generating…' : 'Generate link'}
          </button>
          {linkError && <div style={{ fontSize: '11px', color: 'var(--red)', marginTop: '0.4rem' }}>{linkError}</div>}
          {generatedLink && (
            <div style={{ marginTop: '0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.4rem 0.6rem', fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{generatedLink}</span>
                <span style={{ fontSize: '10px', background: permission === 'edit' ? 'var(--orange)' : 'var(--accent)', color: 'var(--status-text)', padding: '1px 5px', borderRadius: '3px', fontWeight: 700, flexShrink: 0 }}>
                  {permission}
                </span>
              </div>
              <button onClick={() => handleCopy(generatedLink)} style={copyBtnStyle}>
                {copied ? '✓ Copied!' : 'Copy link'}
              </button>
            </div>
          )}
        </div>

        <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.4rem 1rem', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px' }}>
          Close
        </button>
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

