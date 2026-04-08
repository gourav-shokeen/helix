'use client'
// components/ui/GitHubSettingsModal.tsx
// Allows users to connect a GitHub PAT and link a repo to the current document.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface GitHubSettingsModalProps {
  docId: string
  currentRepo: string | null
  onClose: () => void
  onRepoSaved: (repo: string | null) => void
}

export function GitHubSettingsModal({ docId, currentRepo, onClose, onRepoSaved }: GitHubSettingsModalProps) {
  const supabase = createClient()
  const overlayRef = useRef<HTMLDivElement>(null)

  const [pat, setPat] = useState('')
  const [githubUsername, setGithubUsername] = useState('')
  const [connected, setConnected] = useState(false)
  const [repos, setRepos] = useState<Array<{ full_name: string; description: string | null; private: boolean }>>([])
  const [selectedRepo, setSelectedRepo] = useState(currentRepo ?? '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  // Load existing connection
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase
        .from('github_connections')
        .select('github_username')
        .eq('user_id', user.id)
        .maybeSingle()
      if (data?.github_username) {
        setGithubUsername(data.github_username)
        setConnected(true)
        loadRepos()
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadRepos = useCallback(async () => {
    const res = await fetch('/api/github/repos')
    if (res.ok) {
      const { repos: data } = await res.json()
      setRepos(data ?? [])
    }
  }, [])

  const handleConnect = async () => {
    if (!pat.trim()) return
    setSaving(true)
    setStatus(null)
    try {
      // Verify PAT by calling GitHub API directly
      const checkRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${pat.trim()}` },
      })
      if (!checkRes.ok) {
        setStatus('Invalid PAT — GitHub rejected it.')
        return
      }
      const ghUser = await checkRes.json() as { login: string }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await supabase.from('github_connections').upsert({
        user_id: user.id,
        token: pat.trim(),
        github_username: ghUser.login,
      }, { onConflict: 'user_id' })

      setGithubUsername(ghUser.login)
      setConnected(true)
      setPat('')
      setStatus(`Connected as @${ghUser.login}`)
      loadRepos()
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('github_connections').delete().eq('user_id', user.id)
    setConnected(false)
    setGithubUsername('')
    setRepos([])
    setSelectedRepo('')
    setStatus('Disconnected.')
  }

  const handleSaveRepo = async () => {
    setSaving(true)
    const repoValue = selectedRepo.trim() || null
    await supabase.from('documents').update({ github_repo: repoValue }).eq('id', docId)
    onRepoSaved(repoValue)
    setStatus(repoValue ? `Linked to ${repoValue}` : 'Repo unlinked.')
    setSaving(false)
  }

  // Close on overlay click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#0a0a14',
    border: '1px solid #2a2a3e',
    borderRadius: 5,
    padding: '7px 10px',
    color: '#e0e0e0',
    fontFamily: 'var(--font-sans), system-ui, sans-serif',
    fontSize: '12px',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const btnPrimary: React.CSSProperties = {
    padding: '7px 16px',
    background: '#00d4a1',
    color: '#000',
    border: 'none',
    borderRadius: 6,
    fontFamily: 'var(--font-sans), system-ui, sans-serif',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
  }

  const btnSecondary: React.CSSProperties = {
    padding: '7px 16px',
    background: 'none',
    color: '#888',
    border: '1px solid #2a2a3e',
    borderRadius: 6,
    fontFamily: 'var(--font-sans), system-ui, sans-serif',
    fontSize: '12px',
    cursor: 'pointer',
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(8,8,16,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200,
        padding: 24,
      }}
    >
      <div
        style={{
          background: '#0d0d1a',
          border: '1px solid #2a2a3e',
          borderRadius: 10,
          width: '100%',
          maxWidth: 460,
          fontFamily: 'var(--font-sans), system-ui, sans-serif',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 18px',
            borderBottom: '1px solid #2a2a3e',
          }}
        >
          <span style={{ color: '#e0e0e0', fontWeight: 600, fontSize: 13 }}>◎ GitHub Integration</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 18 }}>
            ×
          </button>
        </div>

        <div style={{ padding: '18px' }}>
          {/* PAT Section */}
          {!connected ? (
            <>
              <p style={{ color: '#888', fontSize: '11px', margin: '0 0 12px' }}>
                Paste your GitHub Personal Access Token (PAT) with <code style={{ color: '#00d4a1' }}>repo</code> scope.
              </p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxxxxxx"
                  value={pat}
                  onChange={e => setPat(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button onClick={handleConnect} disabled={saving || !pat.trim()} style={btnPrimary}>
                  {saving ? '…' : 'Connect'}
                </button>
              </div>
            </>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: '#0a0f1a',
                border: '1px solid #1e3e2e',
                borderRadius: 6,
                padding: '8px 12px',
                marginBottom: 16,
              }}
            >
              <span style={{ color: '#00d4a1', fontSize: 16 }}>●</span>
              <span style={{ color: '#e0e0e0', fontSize: 12 }}>Connected as <strong>@{githubUsername}</strong></span>
              <button onClick={handleDisconnect} style={{ ...btnSecondary, marginLeft: 'auto', fontSize: '11px', padding: '4px 10px' }}>
                Disconnect
              </button>
            </div>
          )}

          {/* Repo Section (shown when connected) */}
          {connected && (
            <>
              <label style={{ display: 'block', color: '#888', fontSize: '11px', marginBottom: 6 }}>
                Link GitHub Repo to this document
              </label>
              {repos.length > 0 ? (
                <select
                  value={selectedRepo}
                  onChange={e => setSelectedRepo(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 10 }}
                >
                  <option value="">— none —</option>
                  {repos.map(r => (
                    <option key={r.full_name} value={r.full_name}>
                      {r.private ? '🔒 ' : ''}{r.full_name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="owner/repo-name"
                  value={selectedRepo}
                  onChange={e => setSelectedRepo(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 10 }}
                />
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={onClose} style={btnSecondary}>Cancel</button>
                <button onClick={handleSaveRepo} disabled={saving} style={btnPrimary}>
                  {saving ? '…' : 'Save'}
                </button>
              </div>
            </>
          )}

          {status && (
            <p style={{ color: '#00d4a1', fontSize: '11px', marginTop: 12, marginBottom: 0 }}>{status}</p>
          )}
        </div>
      </div>
    </div>
  )
}
