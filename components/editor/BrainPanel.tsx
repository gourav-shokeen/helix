'use client'
import { useMemo, useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useBrainStore, type BrainFile } from '@/store/brainStore'
import React from 'react'

interface BrainPanelProps {
  onClose: () => void
  docContent?: string
}

const TabButton = ({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) => (
  <button
    onClick={onClick}
    style={{
      padding: '0.25rem 0.75rem',
      background: active ? 'var(--surface-hover)' : 'transparent',
      border: 'none',
      color: active ? 'var(--text)' : 'var(--text-muted)',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 500,
      cursor: 'pointer',
    }}
  >
    {children}
  </button>
);

const GraphView = dynamic(() => import('../graph/KnowledgeGraph').then(mod => mod.KnowledgeGraph), {
  ssr: false,
  loading: () => <p>Loading graph...</p>
});

type Tab = 'map' | 'search' | 'daily'

interface SearchResult {
  file: string
  snippet: string
  context: string
}

function BrainPanelComponent({ onClose, docContent = '' }: BrainPanelProps) {
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
      if (!res.ok) throw new Error('Failed to analyse')
      const data = await res.json()
      setAnalysis(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred')
    } finally {
      setAnalysisLoading(false)
    }
  }

  const search = async () => {
    if (!searchQuery.trim()) return
    setSearchLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ai/brain-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery }),
      })
      if (!res.ok) throw new Error('Failed to search')
      const { results } = await res.json()
      setSearchResults(results)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred')
    } finally {
      setSearchLoading(false)
    }
  }

  const getDailySummary = async () => {
    if (!gitInput.trim()) return
    setDailyLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ai/brain-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: gitInput }),
      })
      if (!res.ok) throw new Error('Failed to get daily summary')
      const { summary: newSummary } = await res.json()
      setDailySummary(newSummary)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred')
    }
  }

  const handleInsert = async () => {
    if (!selectedFile) return
    setInsertStatus('pending')
    try {
      const { data, error: err } = await supabase.storage.from('brain').download(selectedFile.path)
      if (err) throw err
      const content = await data.text()
      window.dispatchEvent(new CustomEvent('helix:editor:insert', { detail: { content } }))
      setInsertStatus('success')
      setTimeout(() => setInsertStatus(''), 2000)
    } catch (e) {
      setInsertStatus('error')
      setTimeout(() => setInsertStatus(''), 2000)
    }
  }

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
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>Brain</span>
          <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: '6px', padding: '2px' }}>
            <TabButton active={tab === 'map'} onClick={() => setTab('map')}>Map</TabButton>
            <TabButton active={tab === 'search'} onClick={() => setTab('search')}>Search</TabButton>
            <TabButton active={tab === 'daily'} onClick={() => setTab('daily')}>Daily</TabButton>
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer' }}>&times;</button>
      </header>

      <main style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {tab === 'map' && (
          <div style={{ display: 'flex', flex: 1 }}>
            <div style={{ width: '220px', borderRight: '1px solid var(--border)', overflowY: 'auto', padding: '0.5rem' }}>
              <div style={{ padding: '0.5rem', fontSize: '11px', color: 'var(--text-muted)' }}>
                {fileMap.length} files analysed.
                <br />
                Last: {lastAnalysed ? new Date(lastAnalysed).toLocaleString() : 'never'}
              </div>
              {tree.map(([folder, files]) => (
                <div key={folder}>
                  <button
                    onClick={() => setCollapsedFolders(prev => ({ ...prev, [folder]: !prev[folder] }))}
                    style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600, padding: '0.5rem', cursor: 'pointer' }}
                  >
                    {collapsedFolders[folder] ? '▶' : '▼'} {folder}
                  </button>
                  {!collapsedFolders[folder] && files.map(file => (
                    <button
                      key={file.path}
                      onClick={() => setSelectedPath(file.path)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: selectedPath === file.path ? 'var(--surface-hover)' : 'transparent',
                        border: 'none',
                        color: 'var(--text)',
                        fontSize: '12px',
                        padding: '0.25rem 0.5rem 0.25rem 1.5rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {file.path.split('/').pop()}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ flex: 1, position: 'relative', overflow: 'auto' }}>
              {importGraph ? (
                <GraphView nodes={graphNodes} edges={graphEdges} onNodeClick={(p) => setSelectedPath(p)} selectedNode={selectedPath} />
              ) : (
                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                  <button onClick={() => setImportGraph(true)} style={{ marginBottom: '1rem' }}>Load Graph</button>
                  <div>Graph view disabled by default to save bundle size.</div>
                </div>
              )}
            </div>
            {selectedFile && (
              <div style={{ width: '280px', borderLeft: '1px solid var(--border)', overflowY: 'auto', padding: '1rem', fontSize: '12px' }}>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '13px' }}>{selectedFile.path.split('/').pop()}</h3>
                <p style={{ color: 'var(--text-secondary)', margin: '0 0 1rem 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{selectedFile.purpose}</p>
                <h4 style={{ margin: '1rem 0 0.5rem 0', fontSize: '11px', color: 'var(--text-muted)' }}>Calls</h4>
                {(selectedFile.calls || []).map(c => <div key={c}>{c}</div>)}
                <h4 style={{ margin: '1rem 0 0.5rem 0', fontSize: '11px', color: 'var(--text-muted)' }}>Called By</h4>
                {reverseLinks.map(l => <div key={l}>{l}</div>)}
                <button
                  onClick={handleInsert}
                  style={{
                    marginTop: '1rem',
                    width: '100%',
                    padding: '0.5rem',
                    background: insertStatus === 'success' ? 'var(--green-solid)' : insertStatus === 'error' ? 'var(--red-solid)' : 'var(--accent)',
                    border: 'none',
                    borderRadius: '4px',
                    color: 'var(--status-text)',
                    cursor: 'pointer',
                  }}
                  disabled={insertStatus === 'pending'}
                >
                  {insertStatus === 'pending' ? 'Inserting...' : insertStatus === 'success' ? 'Inserted!' : insertStatus === 'error' ? 'Error!' : 'Insert into Editor'}
                </button>
              </div>
            )}
          </div>
        )}
        {tab === 'search' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search()}
                placeholder="Search code context..."
                style={{ flex: 1, padding: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
              />
              <button onClick={search} disabled={searchLoading} style={{ padding: '0.5rem 1rem', background: 'var(--accent)', border: 'none', borderRadius: '4px', color: 'var(--status-text)', cursor: 'pointer' }}>
                {searchLoading ? 'Searching...' : 'Search'}
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {searchResults.map((r, i) => (
                <div key={i} style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--surface)', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '0.5rem' }}>{r.file}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', fontFamily: 'JetBrains Mono, monospace' }}>
                    {r.snippet}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'daily' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="text"
                value={gitInput}
                onChange={e => setGitInput(e.target.value)}
                placeholder="Enter GitHub repo URL (e.g. owner/repo)"
                style={{ flex: 1, padding: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
              />
              <button onClick={getDailySummary} disabled={dailyLoading} style={{ padding: '0.5rem 1rem', background: 'var(--accent)', border: 'none', borderRadius: '4px', color: 'var(--status-text)', cursor: 'pointer' }}>
                {dailyLoading ? 'Summarizing...' : 'Get Daily Summary'}
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--text-secondary)' }}>
              {dailySummary}
            </div>
          </div>
        )}
      </main>

      <footer style={{ padding: '0.5rem 1rem', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Paste code or describe a file to analyse..."
          style={{ flex: 1, padding: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
        />
        <button onClick={analyse} disabled={analysisLoading} style={{ padding: '0.5rem 1rem', background: 'var(--accent)', border: 'none', borderRadius: '4px', color: 'var(--status-text)', cursor: 'pointer' }}>
          {analysisLoading ? 'Analysing...' : 'Analyse'}
        </button>
        {error && <div style={{ color: 'var(--red)', fontSize: '11px' }}>{error}</div>}
      </footer>
    </aside>
  )
}




export const BrainPanel = React.memo(BrainPanelComponent)

