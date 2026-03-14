'use client'
import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useBrainStore, type BrainFile } from '@/store/brainStore'

interface BrainPanelProps {
  onClose: () => void
  docContent?: string
}

type Tab = 'map' | 'search' | 'daily'

interface SearchResult {
  file: string
  snippet: string
  context: string
}

export function BrainPanel({ onClose, docContent = '' }: BrainPanelProps) {
  const { user } = useAuth()
  const { fileMap, summary, lastAnalysed, setAnalysis } = useBrainStore()
  const [tab, setTab] = useState<Tab>('map')
  const [input, setInput] = useState('')
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [gitInput, setGitInput] = useState('')
  const [dailySummary, setDailySummary] = useState('')
  const [dailyLoading, setDailyLoading] = useState(false)
  const [importGraph, setImportGraph] = useState(false)
  const [selectedPath, setSelectedPath] = useState('')
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const [insertStatus, setInsertStatus] = useState('')

  const supabase = createClient()

  const tree = useMemo(() => {
    const folderMap = new Map<string, BrainFile[]>()
    for (const file of fileMap) {
      const folder = file.path.split('/')[0] || 'root'
      const list = folderMap.get(folder) || []
      list.push(file)
      folderMap.set(folder, list)
    }
    return Array.from(folderMap.entries()).sort((a, b) => (a[0] > b[0] ? 1 : -1))
  }, [fileMap])

  const graphNodes = useMemo(() => {
    const width = 360
    const height = 220
    const folders = Array.from(new Set(fileMap.map((item) => item.path.split('/')[0] || 'root')))
    return fileMap.map((file, index) => {
      const folder = file.path.split('/')[0] || 'root'
      const folderIndex = folders.indexOf(folder)
      const perFolder = fileMap.filter((item) => (item.path.split('/')[0] || 'root') === folder)
      const indexInFolder = perFolder.findIndex((item) => item.path === file.path)

      return {
        ...file,
        x: 40 + (folderIndex + 1) * (width / (folders.length + 1)),
        y: 40 + (indexInFolder + 1) * (height / (perFolder.length + 1)),
        index,
      }
    })
  }, [fileMap])

  const graphEdges = useMemo(() => {
    const nodeMap = new Map(graphNodes.map((node) => [node.path, node]))
    const edges: Array<{ from: string; to: string }> = []
    for (const file of fileMap) {
      for (const caller of file.calledBy || []) {
        if (nodeMap.has(caller) && nodeMap.has(file.path)) {
          edges.push({ from: caller, to: file.path })
        }
      }
    }
    return edges
  }, [fileMap, graphNodes])

  const selectedFile = fileMap.find((item) => item.path === selectedPath) || null
  const reverseLinks = useMemo(
    () => fileMap.filter((item) => (item.calledBy || []).includes(selectedPath)).map((item) => item.path),
    [fileMap, selectedPath]
  )

  const analyse = async () => {
    const payload = input.trim() || docContent
    if (!payload) return

    setAnalysisLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ai/brain-analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pastedContent: payload }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to analyse')

      const files = Array.isArray(json.files) ? (json.files as BrainFile[]) : []
      setAnalysis({ fileMap: files, summary: String(json.summary || '') })
      if (files[0]?.path) setSelectedPath(files[0].path)
    } catch (err) {
      setError(`⚠ ${String(err)}`)
    } finally {
      setAnalysisLoading(false)
    }
  }

  const runSearch = async () => {
    if (!searchQuery.trim() || fileMap.length === 0) return
    setSearchLoading(true)
    setError('')
    setSearchResults([])
    try {
      const res = await fetch('/api/ai/brain-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery.trim(), fileMap }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Search failed')
      setSearchResults(Array.isArray(json.results) ? (json.results as SearchResult[]) : [])
    } catch (err) {
      setError(`⚠ ${String(err)}`)
    } finally {
      setSearchLoading(false)
    }
  }

  const runDaily = async () => {
    const value = gitInput.trim()
    if (!value) return
    setDailyLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ai/brain-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gitInput: value }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to generate summary')
      setDailySummary(String(json.summary || ''))
    } catch (err) {
      setError(`⚠ ${String(err)}`)
    } finally {
      setDailyLoading(false)
    }
  }

  const insertIntoDevlog = async () => {
    const value = dailySummary.trim()
    if (!user?.id || !value) return

    setInsertStatus('Saving to Dev Log...')
    try {
      const date = new Date().toISOString().slice(0, 10)
      const { data: existing } = await supabase
        .from('dev_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', date)
        .maybeSingle()

      const existingHtml = String(existing?.content || '<h2>What I built</h2><p></p><h2>What\'s next</h2><p></p><h2>Blockers</h2><p></p>')
      const nextHtml = existingHtml.replace(
        '<h2>What I built</h2>',
        `<h2>What I built</h2><p>${value.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
      )

      const { error: saveError } = await supabase
        .from('dev_logs')
        .upsert(
          {
            user_id: user.id,
            date,
            content: nextHtml,
            project_id: existing?.project_id ?? null,
            mood: existing?.mood ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,date' }
        )

      if (saveError) throw saveError
      setInsertStatus('Inserted into today\'s Dev Log')
      setTimeout(() => setInsertStatus(''), 1600)
    } catch (err) {
      setInsertStatus(`Failed: ${String(err)}`)
    }
  }

  const needsInput = fileMap.length === 0

  return (
    <aside
      className="helix-fade-in"
      style={{
        width: '400px',
        borderLeft: '1px solid var(--border)',
        background: '#0d0d1a',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '12px' }}>⬡ Codebase Brain</span>
        <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px' }}>×</button>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {(['map', 'search', 'daily'] as Tab[]).map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            style={{
              flex: 1,
              padding: '0.45rem 0',
              background: tab === item ? 'var(--accent-dim)' : 'none',
              borderBottom: tab === item ? '2px solid var(--accent)' : '2px solid transparent',
              border: 'none',
              color: tab === item ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '11px',
              fontFamily: 'JetBrains Mono, monospace',
              transition: 'all 0.15s',
            }}
          >
            {item === 'map' ? 'Map' : item === 'search' ? 'Search' : 'Daily Summary'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', position: 'relative' }}>
        {needsInput && (
          <div style={{ marginBottom: '0.75rem', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ padding: '0.45rem 0.6rem', fontSize: 10, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
              Paste folder tree and/or package.json content
            </div>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={docContent ? 'Paste content or leave empty to analyse current doc text' : 'Paste tree/package.json here'}
              style={{ width: '100%', height: 140, border: 'none', outline: 'none', resize: 'vertical', background: 'var(--bg)', color: 'var(--text-primary)', fontSize: 11, lineHeight: 1.5, fontFamily: 'JetBrains Mono, monospace', padding: '0.55rem' }}
            />
            <div style={{ padding: '0.55rem', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={analyse}
                disabled={analysisLoading}
                style={{ background: 'var(--accent)', border: 'none', borderRadius: 4, color: 'var(--status-text)', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '0.35rem 0.65rem' }}
              >
                {analysisLoading ? 'Analysing…' : 'Analyse'}
              </button>
            </div>
          </div>
        )}

        {!needsInput && (
          <div style={{ marginBottom: '0.75rem', border: '1px solid var(--border)', borderRadius: 6, padding: '0.55rem', background: 'var(--surface)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              Last analysed: {lastAnalysed ? new Date(lastAnalysed).toLocaleString() : 'n/a'}
            </div>
            {summary && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>{summary}</div>}
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--red)', fontSize: '12px', whiteSpace: 'pre-wrap', marginBottom: '0.75rem' }}>{error}</div>
        )}

        {!needsInput && tab === 'map' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <button onClick={analyse} disabled={analysisLoading} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, padding: '0.25rem 0.55rem' }}>{analysisLoading ? 'Updating…' : 'Update'}</button>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 10 }}>
                <input type="checkbox" checked={importGraph} onChange={(e) => setImportGraph(e.target.checked)} />
                Import graph
              </label>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
              {tree.map(([folder, files]) => {
                const collapsed = Boolean(collapsedFolders[folder])
                return (
                  <div key={folder}>
                    <button onClick={() => setCollapsedFolders((prev) => ({ ...prev, [folder]: !collapsed }))} style={{ width: '100%', background: 'var(--surface)', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, padding: '0.4rem 0.5rem', textAlign: 'left' }}>{collapsed ? '▸' : '▾'} {folder}</button>
                    {!collapsed && files.map((file) => (
                      <button
                        key={file.path}
                        onClick={() => setSelectedPath(file.path)}
                        style={{ width: '100%', background: selectedPath === file.path ? 'var(--accent-dim)' : 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: selectedPath === file.path ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, padding: '0.35rem 0.5rem 0.35rem 1.5rem', textAlign: 'left' }}
                      >
                        {file.path}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>

            {importGraph && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 6, background: '#0a0a14', marginBottom: 10, padding: 6 }}>
                <svg width="100%" height="240" viewBox="0 0 380 240">
                  <defs>
                    <marker id="brain-arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="#333" />
                    </marker>
                  </defs>
                  {graphEdges.map((edge, index) => {
                    const from = graphNodes.find((item) => item.path === edge.from)
                    const to = graphNodes.find((item) => item.path === edge.to)
                    if (!from || !to) return null
                    return <line key={`${edge.from}-${edge.to}-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#333" strokeWidth="1" markerEnd="url(#brain-arrow)" />
                  })}
                  {graphNodes.map((node) => (
                    <g key={node.path} onClick={() => setSelectedPath(node.path)} style={{ cursor: 'pointer' }}>
                      <circle cx={node.x} cy={node.y} r={6} fill="#00d4a1" opacity={selectedPath === node.path ? 1 : 0.8} />
                      <text x={node.x + 8} y={node.y + 3} fill={selectedPath === node.path ? '#00d4a1' : '#7a7a90'} fontSize="9" fontFamily="JetBrains Mono, monospace">
                        {node.path.split('/').slice(-1)[0]}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            )}

            {selectedFile && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.55rem' }}>
                <div style={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{selectedFile.path}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 4 }}>{selectedFile.purpose}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 8 }}>Calls from: {(selectedFile.calledBy || []).join(', ') || '—'}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 4 }}>Imported by: {reverseLinks.join(', ') || '—'}</div>
              </div>
            )}
          </>
        )}

        {!needsInput && tab === 'search' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Where is useEffect used?"
                style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, outline: 'none', padding: '0.35rem 0.45rem' }}
              />
              <button onClick={runSearch} disabled={searchLoading} style={{ background: 'var(--accent)', border: 'none', borderRadius: 4, color: 'var(--status-text)', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '0.35rem 0.55rem' }}>{searchLoading ? '…' : 'Search'}</button>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {searchResults.map((item, index) => (
                <div key={`${item.file}-${index}`} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.5rem' }}>
                  <div style={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>{item.file}</div>
                  <div style={{ color: 'var(--text-primary)', fontSize: 11, marginTop: 4 }}>{item.snippet}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 4 }}>{item.context}</div>
                </div>
              ))}
              {searchResults.length === 0 && !searchLoading && <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>No results yet.</div>}
            </div>
          </>
        )}

        {!needsInput && tab === 'daily' && (
          <>
            <textarea
              value={gitInput}
              onChange={(event) => setGitInput(event.target.value)}
              placeholder="Paste git diff --stat HEAD~1 or git log --oneline -10"
              style={{ width: '100%', minHeight: 120, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, lineHeight: 1.5, outline: 'none', padding: '0.55rem', resize: 'vertical' }}
            />
            <div style={{ marginTop: 8 }}>
              <button onClick={runDaily} disabled={dailyLoading} style={{ background: 'var(--accent)', border: 'none', borderRadius: 4, color: 'var(--status-text)', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '0.35rem 0.55rem' }}>{dailyLoading ? 'Generating…' : 'Generate summary'}</button>
            </div>

            {dailySummary && (
              <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 6, padding: '0.65rem' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.6 }}>{dailySummary}</div>
                <button onClick={insertIntoDevlog} style={{ marginTop: 8, background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 4, color: 'var(--accent)', cursor: 'pointer', fontSize: 10, padding: '0.3rem 0.55rem' }}>
                  Insert into Dev Log
                </button>
                {insertStatus && <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 10 }}>{insertStatus}</div>}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
