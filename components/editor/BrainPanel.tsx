'use client'
import { useMemo, useState } from 'react'
import { useBrainStore, type BrainFile } from '@/store/brainStore'
import React from 'react'
import dynamic from 'next/dynamic'

interface BrainPanelProps {
  onClose: () => void
  docContent?: string
  collapsed: boolean
  onCollapsedChange: (v: boolean) => void
}

const TabButton = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    style={{
      padding: '0.25rem 0.75rem',
      background: active ? 'var(--surface-hover)' : 'transparent',
      border: 'none',
      color: active ? 'var(--text-primary)' : 'var(--text-muted)',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 500,
      cursor: 'pointer',
    }}
  >
    {children}
  </button>
)

type Tab = 'map' | 'repo'

function BrainPanelComponent({ onClose, docContent = '', collapsed, onCollapsedChange }: BrainPanelProps) {
  const { fileMap, summary, lastAnalysed, setAnalysis } = useBrainStore()
  const [tab, setTab] = useState<Tab>('map')
  const [selectedPath, setSelectedPath] = useState('')
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({})
  const [insertStatus, setInsertStatus] = useState('')
  const [error, setError] = useState('')

  const [gitInput, setGitInput] = useState('')
  const [repoStep, setRepoStep] = useState<'input' | 'folders' | 'analysing' | 'done'>('input')
  const [repoMeta, setRepoMeta] = useState<{ owner: string; repo: string; totalFiles: number } | null>(null)
  const [repoFolders, setRepoFolders] = useState<string[]>([])
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set())
  const [fetchingFolders, setFetchingFolders] = useState(false)
  const [analysing, setAnalysing] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState('')

  const tree = useMemo(() => {
    const folderMap = new Map<string, BrainFile[]>()
    for (const file of fileMap) {
      const parts = file.path.split('/')
      const folder = parts.length > 1 ? parts[0] : '(root)'
      const list = folderMap.get(folder) || []
      list.push(file)
      folderMap.set(folder, list)
    }
    return Array.from(folderMap.entries()).sort((a, b) => (a[0] > b[0] ? 1 : -1))
  }, [fileMap])

  const selectedFile = fileMap.find(f => f.path === selectedPath) || null
  const reverseLinks = useMemo(
    () => fileMap.filter(f => (f.calledBy || []).includes(selectedPath)).map(f => f.path),
    [fileMap, selectedPath]
  )

  const fetchFolders = async () => {
    if (!gitInput.trim()) return
    setFetchingFolders(true)
    setError('')
    try {
      const res = await fetch('/api/ai/brain-repo/tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: gitInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRepoMeta({ owner: data.owner, repo: data.repo, totalFiles: data.totalFiles })
      setRepoFolders(data.folders)
      setSelectedFolders(new Set(data.folders))
      setRepoStep('folders')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch repo')
    } finally {
      setFetchingFolders(false)
    }
  }

  const runAnalysis = async () => {
    if (!repoMeta || selectedFolders.size === 0) return
    setAnalysing(true)
    setRepoStep('analysing')
    setError('')
    setAnalysisStatus('Fetching files from GitHub...')
    try {
      const statusTimer = setTimeout(
        () => setAnalysisStatus('Stay back and enjoy while I make you a summary of the selected folders ☕'),
        3000
      )
      const res = await fetch('/api/ai/brain-repo/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: repoMeta.owner,
          repo: repoMeta.repo,
          folders: Array.from(selectedFolders),
        }),
      })
      clearTimeout(statusTimer)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAnalysis(data)
      localStorage.setItem('helix-brain-repo', JSON.stringify({ owner: repoMeta.owner, repo: repoMeta.repo }))
      setRepoStep('done')
      setAnalysisStatus(`✓ ${data.fileMap.length} files mapped`)
      setTimeout(() => setTab('map'), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
      setRepoStep('folders')
    } finally {
      setAnalysing(false)
    }
  }

  const resetRepo = () => {
    setRepoStep('input')
    setRepoMeta(null)
    setRepoFolders([])
    setSelectedFolders(new Set())
    setAnalysisStatus('')
    setError('')
  }

  const handleInsert = async () => {
    if (!selectedFile) return
    setInsertStatus('pending')
    try {
      let content = selectedFile.purpose
      const stored = localStorage.getItem('helix-brain-repo')
      if (stored) {
        const { owner, repo } = JSON.parse(stored)
        for (const branch of ['main', 'master', 'HEAD']) {
          const res = await fetch(
            `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${selectedFile.path}`
          )
          if (res.ok) { content = await res.text(); break }
        }
      }
      window.dispatchEvent(new CustomEvent('helix:editor:insert', { detail: { content } }))
      setInsertStatus('success')
      setTimeout(() => setInsertStatus(''), 2000)
    } catch {
      setInsertStatus('error')
      setTimeout(() => setInsertStatus(''), 2000)
    }
  }

  // ── Collapsed strip ──
  if (collapsed) {
    return (
      <aside style={{
        width: '36px',
        borderLeft: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flexShrink: 0,
        height: '100%',
        gap: '0.5rem',
        paddingTop: '0.75rem',
      }}>
        <button onClick={() => onCollapsedChange(false)} title="Expand Brain panel" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '2px' }}>
          🧠
        </button>
        <span onClick={() => onCollapsedChange(false)} style={{ fontSize: '10px', color: 'var(--text-muted)', writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: '0.05em', marginTop: '4px', cursor: 'pointer', userSelect: 'none' }}>
          BRAIN
        </span>
      </aside>
    )
  }

  return (
    <aside
      className="helix-fade-in"
      style={{
        width: '360px',
        borderLeft: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>🧠 Brain</span>
          <div style={{ display: 'flex', background: 'var(--surface-hover)', borderRadius: '6px', padding: '2px' }}>
            <TabButton active={tab === 'map'} onClick={() => setTab('map')}>Map</TabButton>
            <TabButton active={tab === 'repo'} onClick={() => setTab('repo')}>Repo</TabButton>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button onClick={() => onCollapsedChange(true)} title="Collapse panel" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '14px', cursor: 'pointer', lineHeight: 1, padding: '2px 4px' }}>▶</button>
          <button onClick={onClose} title="Close panel" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {tab === 'map' && (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <div style={{ width: '160px', borderRight: '1px solid var(--border)', overflowY: 'auto', padding: '0.5rem', flexShrink: 0 }}>
              <div style={{ padding: '0.4rem 0.5rem', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {fileMap.length > 0
                  ? <>{fileMap.length} files · {lastAnalysed ? new Date(lastAnalysed).toLocaleDateString() : ''}</>
                  : <>Use Repo tab to analyse.</>
                }
              </div>
              {tree.map(([folder, files]) => (
                <div key={folder}>
                  {(tree.length > 1 || folder !== '(root)') && (
                    <button
                      onClick={() => setCollapsedFolders(prev => ({ ...prev, [folder]: !prev[folder] }))}
                      style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '10px', fontWeight: 700, padding: '0.4rem 0.5rem 0.2rem', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                    >
                      {collapsedFolders[folder] ? '▶' : '▼'} {folder === '(root)' ? 'root' : folder}
                    </button>
                  )}
                  {!collapsedFolders[folder] && files.map(file => (
                    <button
                      key={file.path}
                      onClick={() => setSelectedPath(file.path)}
                      title={file.path}
                      style={{
                        width: '100%', textAlign: 'left',
                        background: selectedPath === file.path ? 'var(--surface-hover)' : 'transparent',
                        border: 'none',
                        color: selectedPath === file.path ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontSize: '12px', padding: '0.3rem 0.5rem 0.3rem 1rem', borderRadius: '4px',
                        cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block',
                      }}
                    >
                      {file.path.split('/').pop()}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', fontSize: '12px' }}>
              {selectedFile ? (
                <>
                  <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '0.25rem', wordBreak: 'break-all', color: 'var(--text-primary)' }}>{selectedFile.path.split('/').pop()}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '0.75rem', fontFamily: 'JetBrains Mono, monospace', opacity: 0.7 }}>{selectedFile.path}</div>
                  <p style={{ color: 'var(--text-secondary)', margin: '0 0 1rem 0', lineHeight: 1.7 }}>{selectedFile.purpose}</p>
                  {(selectedFile.calls || []).length > 0 && (
                    <>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '1rem 0 0.4rem' }}>Calls</div>
                      {(selectedFile.calls || []).map(c => <div key={c} onClick={() => setSelectedPath(c)} style={{ padding: '0.2rem 0', color: 'var(--accent)', cursor: 'pointer', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}>{c}</div>)}
                    </>
                  )}
                  {reverseLinks.length > 0 && (
                    <>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '1rem 0 0.4rem' }}>Called By</div>
                      {reverseLinks.map(l => <div key={l} onClick={() => setSelectedPath(l)} style={{ padding: '0.2rem 0', color: 'var(--accent)', cursor: 'pointer', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}>{l}</div>)}
                    </>
                  )}
                  <button
                    onClick={handleInsert}
                    style={{ marginTop: '1.25rem', width: '100%', padding: '0.5rem', background: insertStatus === 'success' ? 'var(--green-solid)' : insertStatus === 'error' ? 'var(--red-solid)' : 'var(--accent)', border: 'none', borderRadius: '4px', color: 'var(--status-text)', cursor: 'pointer', fontSize: '12px' }}
                    disabled={insertStatus === 'pending'}
                  >
                    {insertStatus === 'pending' ? 'Fetching & inserting...' : insertStatus === 'success' ? 'Inserted ✓' : insertStatus === 'error' ? 'Error' : 'Insert into Editor'}
                  </button>
                </>
              ) : (
                <div>
                  {summary ? (
                    <>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>Project Summary</div>
                      <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{summary}</p>
                    </>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      {fileMap.length > 0 ? 'Select a file to see its purpose and connections.' : 'No codebase analysed yet. Go to the Repo tab to get started.'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'repo' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1rem', gap: '0.75rem', overflowY: 'auto' }}>
            {repoStep === 'input' && (
              <>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>Enter a public GitHub repo URL. Helix will fetch its folder structure so you can pick what to analyse.</div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="text" value={gitInput} onChange={e => setGitInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchFolders()} placeholder="https://github.com/owner/repo" style={{ flex: 1, padding: '0.5rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '12px' }} />
                  <button onClick={fetchFolders} disabled={fetchingFolders || !gitInput.trim()} style={{ padding: '0.5rem 1rem', background: 'var(--accent)', border: 'none', borderRadius: '4px', color: 'var(--status-text)', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap', opacity: fetchingFolders || !gitInput.trim() ? 0.6 : 1 }}>
                    {fetchingFolders ? 'Fetching...' : 'Fetch →'}
                  </button>
                </div>
              </>
            )}

            {repoStep === 'folders' && repoMeta && (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{repoMeta.owner}/{repoMeta.repo}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{repoMeta.totalFiles} total files · pick folders to analyse</div>
                  </div>
                  <button onClick={resetRepo} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px' }}>← Change</button>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => setSelectedFolders(new Set(repoFolders))} style={{ fontSize: '11px', padding: '0.2rem 0.6rem', background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-muted)', cursor: 'pointer' }}>Select all</button>
                  <button onClick={() => setSelectedFolders(new Set())} style={{ fontSize: '11px', padding: '0.2rem 0.6rem', background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-muted)', cursor: 'pointer' }}>Clear</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {repoFolders.map(folder => (
                    <label key={folder} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.5rem', borderRadius: '4px', cursor: 'pointer', background: selectedFolders.has(folder) ? 'var(--surface-hover)' : 'transparent', fontSize: '12px', color: 'var(--text-primary)' }}>
                      <input type="checkbox" checked={selectedFolders.has(folder)} onChange={e => { const next = new Set(selectedFolders); e.target.checked ? next.add(folder) : next.delete(folder); setSelectedFolders(next) }} style={{ accentColor: 'var(--accent)' }} />
                      <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{folder}</span>
                    </label>
                  ))}
                </div>
                <button onClick={runAnalysis} disabled={selectedFolders.size === 0} style={{ padding: '0.6rem 1rem', background: 'var(--accent)', border: 'none', borderRadius: '6px', color: 'var(--status-text)', cursor: selectedFolders.size === 0 ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600, opacity: selectedFolders.size === 0 ? 0.5 : 1 }}>
                  Analyse {selectedFolders.size} folder{selectedFolders.size !== 1 ? 's' : ''} →
                </button>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Max 60 files. Large repos may take 1–2 min.</div>
              </>
            )}

            {repoStep === 'analysing' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', padding: '2rem' }}>
                <div style={{ width: '36px', height: '36px', border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.7 }}>{analysisStatus}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', opacity: 0.6 }}>You can close this panel and keep working —<br />the analysis runs in the background.</div>
              </div>
            )}

            {repoStep === 'done' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
                <div style={{ fontSize: '32px' }}>🧠</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{analysisStatus}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Switching to Map tab…</div>
              </div>
            )}

            {error && (
              <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(255,80,80,0.08)', border: '1px solid var(--red)', borderRadius: '4px', color: 'var(--red)', fontSize: '11px' }}>{error}</div>
            )}
          </div>
        )}
      </main>
    </aside>
  )
}

export const BrainPanel = React.memo(BrainPanelComponent)