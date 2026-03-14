'use client'
// app/(app)/doc/[id]/page.tsx — Main Editor Page
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { usePomodoro } from '@/hooks/usePomodoro'
import { useFocusMode } from '@/hooks/useFocusMode'
import { usePresence } from '@/hooks/usePresence'
import { getDocument, getMyDocuments, deleteDocument, createDocument, updateDocumentTitle } from '@/lib/supabase/documents'
import { getBoardById } from '@/lib/supabase/projects'
import { downloadFile } from '@/lib/utils'
import { TopBar } from '@/components/layout/TopBar'
import { Sidebar } from '@/components/layout/Sidebar'
import { StatusBar } from '@/components/layout/StatusBar'
import { RightPanel } from '@/components/layout/RightPanel'
import { CommandPalette } from '@/components/ui/CommandPalette'
import { ShareModal } from '@/components/ui/ShareModal'
import { GitHubSettingsModal } from '@/components/ui/GitHubSettingsModal'
import { EditorWrapper } from '@/components/editor/EditorWrapper'
import type { Document, KanbanColumn, KanbanCard } from '@/types'

export default function DocPage() {
  const { id } = useParams<{ id: string }>()
  const { user, loading } = useAuth()
  const router = useRouter()

  const [docs, setDocs] = useState<Document[]>([])
  const [provider, setProvider] = useState<unknown>(null)
  const [wordCount, setWordCount] = useState(0)
  const [commandOpen, setCommandOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [githubSettingsOpen, setGithubSettingsOpen] = useState(false)
  const [sessionOverlay, setSessionOverlay] = useState<'break' | 'after-break' | null>(null)
  const [readmeModal, setReadmeModal] = useState<{ content: string; title: string } | null>(null)

  const [saving, setSaving] = useState(false)
  const [currentDoc, setCurrentDoc] = useState<Document | null>(null)
  const [githubRepo, setGithubRepo] = useState<string | null>(null)

  const { isFocused, toggle: toggleFocusStore } = useFocusMode()
  const pomodoro = usePomodoro()
  const onlineUsers = usePresence(provider)

  // Auto-start/stop Pomodoro when focus mode toggles
  const toggleFocus = useCallback(() => {
    if (!isFocused) {
      pomodoro.start()
    } else {
      pomodoro.stop()
      setSessionOverlay(null)
    }
    toggleFocusStore()
  }, [isFocused, pomodoro, toggleFocusStore])

  // Detect work session → break transition to show overlay
  const prevPomoStateRef = useRef(pomodoro.state)
  useEffect(() => {
    const prev = prevPomoStateRef.current
    const curr = pomodoro.state
    prevPomoStateRef.current = curr
    if (prev === 'working' && (curr === 'break' || curr === 'longBreak')) {
      setSessionOverlay('break')
    } else if ((prev === 'break' || prev === 'longBreak') && curr === 'working') {
      setSessionOverlay('after-break')
    } else if (curr === 'idle') {
      setSessionOverlay(null)
    }
  }, [pomodoro.state])

  // Auth guard
  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  // Load document
  useEffect(() => {
    if (!id) return
    getDocument(id).then(({ data }) => {
      const doc = data as Document ?? null
      setCurrentDoc(doc)
      setGithubRepo(doc?.github_repo ?? null)
    })
  }, [id])

  // Load sidebar docs
  useEffect(() => {
    if (!user) return
    getMyDocuments(user.id).then(({ data }) => setDocs((data as Document[]) ?? []))
  }, [user])

  // ⌘K and ⌘⇧F / ⌘⇧G / ⌘⇧B shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCommandOpen(true) }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'F') { e.preventDefault(); toggleFocus() }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'G') { e.preventDefault(); router.push('/graph') }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('helix:brain:open'))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleFocus, router])

  const handleNewDoc = useCallback(async () => {
    if (!user) return
    const { data } = await createDocument(user.id)
    if (data) router.push(`/doc/${data.id}`)
  }, [user, router])

  const handleExportMd = useCallback(async () => {
    const html = document.querySelector('.tiptap-editor')?.innerHTML ?? ''
    const res = await fetch('/api/export/markdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: html, title: currentDoc?.title }),
    })
    const blob = await res.blob()
    const filename = `${(currentDoc?.title ?? 'document').replace(/\s+/g, '-').toLowerCase()}.md`
    downloadFile(await blob.text(), filename, 'text/markdown')
  }, [currentDoc])

  const handleExportPdf = useCallback(() => {
    window.print()
  }, [])

  const handleExportCsv = useCallback(async () => {
    const kanbanEl = document.querySelector('[data-type="kanban-block"]') as HTMLElement | null
    const boardId = kanbanEl?.getAttribute('data-board-id')
    if (!boardId) { alert('No kanban board found in this document.'); return }
    const { data: board } = await getBoardById(boardId)
    if (!board?.data) return
    const boardData = board.data as { columns: KanbanColumn[] }
    let csv = 'Title,Column,Assignee,Label,Due Date\n'
    boardData.columns.forEach((col: KanbanColumn) => {
      col.cards.forEach((card: KanbanCard) => {
        csv += `"${card.title}","${col.title}","${card.assignee ?? ''}","${card.label ?? ''}","${card.dueDate ?? ''}"\n`
      })
    })
    downloadFile(csv, 'kanban.csv', 'text/csv')
  }, [])

  const handleGenerateReadme = useCallback(async () => {
    const content = document.querySelector('.tiptap-editor')?.textContent ?? ''
    const res = await fetch('/api/export/readme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.slice(0, 3000), title: currentDoc?.title }),
    })
    const { readme } = await res.json()
    if (readme) setReadmeModal({ content: readme, title: currentDoc?.title ?? 'README' })
  }, [currentDoc])

  const handleDeleteDoc = useCallback(async () => {
    if (!id) return
    if (!confirm(`Delete "${currentDoc?.title || 'Untitled'}"? This cannot be undone.`)) return
    await deleteDocument(id)
    router.push('/dashboard')
  }, [id, currentDoc, router])

  const handleImportReadme = useCallback(async () => {
    if (!githubRepo || !user) return
    const res = await fetch(`/api/github/readme?repo=${encodeURIComponent(githubRepo)}`)
    if (!res.ok) { alert('Could not fetch README from GitHub.'); return }
    const { markdown } = await res.json()
    if (!markdown) return
    const { data: newDoc } = await createDocument(user.id)
    if (!newDoc) return
    // Stash markdown in localStorage; EditorWrapper picks it up on first mount
    localStorage.setItem(`helix_readme_import_${newDoc.id}`, markdown)
    router.push(`/doc/${newDoc.id}`)
  }, [githubRepo, user, router])

  if (loading || !user) return null

  const sidebarWidth = isFocused ? 0 : 205
  const rightPanelWidth = isFocused ? 0 : 185

  return (
    <div
      className={isFocused ? 'focus-active' : ''}
      data-focus-mode={isFocused}
      style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <TopBar
        docTitle={currentDoc?.title ?? 'Untitled'}
        onTitleChange={async (t) => {
          setCurrentDoc(prev => prev ? { ...prev, title: t } : prev)
          if (currentDoc?.id) {
            setSaving(true)
            await updateDocumentTitle(currentDoc.id, t)
            setSaving(false)
          }
        }}
        onlineUsers={onlineUsers}
        onShareClick={() => setShareOpen(true)}
        onCommandClick={() => setCommandOpen(true)}
        onExportMd={handleExportMd}
        onExportPdf={handleExportPdf}
        onExportCsv={handleExportCsv}
        onGenerateReadme={handleGenerateReadme}
        onDeleteDoc={handleDeleteDoc}
        onGitHubSettings={() => setGithubSettingsOpen(true)}
        showDoc
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{ width: sidebarWidth, transition: 'width 0.3s ease', overflow: 'hidden', flexShrink: 0 }}>
          <Sidebar
            docs={docs}
            activeDocId={id}
            onNewDoc={handleNewDoc}
            githubRepo={githubRepo}
            onImportReadme={handleImportReadme}
          />
        </div>

        {/* Editor + Brain Panel */}
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          <EditorWrapper
            documentId={id}
            user={user}
            onWordCount={setWordCount}
            onProviderReady={setProvider}
            isFocused={isFocused}
            githubRepo={githubRepo}
          />
        </main>

        {/* Right Panel */}
        <div style={{ width: rightPanelWidth, transition: 'width 0.3s ease', overflow: 'hidden', flexShrink: 0 }}>
          <RightPanel
            onlineUsers={onlineUsers}
            pomodoroState={pomodoro.state}
            pomodoroTime={pomodoro.timeDisplay}
            pomodoroStart={pomodoro.start}
            pomodoroStop={pomodoro.stop}
            isFocused={isFocused}
            onToggleFocus={toggleFocus}
          />
        </div>
      </div>

      <StatusBar
        saving={saving}
        wordCount={wordCount}
        onlineCount={onlineUsers.length}
        pomodoroState={pomodoro.state}
        pomodoroTime={pomodoro.state !== 'idle' ? pomodoro.timeDisplay : undefined}
        isFocused={isFocused}
        onExitFocus={toggleFocus}
      />

      {/* Focus mode session complete overlay */}
      {isFocused && sessionOverlay === 'break' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,8,16,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0d0d1a', border: '1px solid #2a2a3e', borderRadius: 12, padding: '36px 44px', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', minWidth: 320 }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>⬡</div>
            <h3 style={{ color: '#e0e0e0', fontSize: 16, marginBottom: 8, fontWeight: 600 }}>Session complete.</h3>
            <p style={{ color: '#666', fontSize: 13, marginBottom: 28 }}>Take a 5 min break.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={() => setSessionOverlay(null)}
                style={{ background: '#00d4a1', color: '#000', border: 'none', borderRadius: 6, padding: '9px 18px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                ◎ Start Break 5 min
              </button>
              <button
                onClick={toggleFocus}
                style={{ background: 'none', color: '#666', border: '1px solid #2a2a3e', borderRadius: 6, padding: '9px 18px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, cursor: 'pointer' }}
              >
                ✕ Exit Focus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* After break: start another session? */}
      {isFocused && sessionOverlay === 'after-break' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,8,16,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0d0d1a', border: '1px solid #2a2a3e', borderRadius: 12, padding: '36px 44px', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', minWidth: 280 }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>◉</div>
            <p style={{ color: '#e0e0e0', fontSize: 14, marginBottom: 24 }}>Start another session?</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={() => setSessionOverlay(null)}
                style={{ background: '#00d4a1', color: '#000', border: 'none', borderRadius: 6, padding: '9px 18px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                ▶ Yes, continue
              </button>
              <button
                onClick={toggleFocus}
                style={{ background: 'none', color: '#666', border: '1px solid #2a2a3e', borderRadius: 6, padding: '9px 18px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, cursor: 'pointer' }}
              >
                ✕ Exit Focus
              </button>
            </div>
          </div>
        </div>
      )}

      {commandOpen && (
        <CommandPalette
          onClose={() => setCommandOpen(false)}
          docId={id}
          docTitle={currentDoc?.title}
        />
      )}

      {shareOpen && currentDoc && (
        <ShareModal
          docId={id}
          isPublic={currentDoc.is_public}
          onClose={() => setShareOpen(false)}
        />
      )}

      {githubSettingsOpen && currentDoc && (
        <GitHubSettingsModal
          docId={id}
          currentRepo={githubRepo}
          onClose={() => setGithubSettingsOpen(false)}
          onRepoSaved={(repo) => {
            setGithubRepo(repo)
            setCurrentDoc(prev => prev ? { ...prev, github_repo: repo ?? undefined } : prev)
          }}
        />
      )}

      {/* README modal */}
      {readmeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,8,16,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 24 }}>
          <div style={{ background: '#0d0d1a', border: '1px solid #2a2a3e', borderRadius: 10, width: '100%', maxWidth: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #2a2a3e' }}>
              <span style={{ color: '#e0e0e0', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600 }}>▤ Generated README — {readmeModal.title}</span>
              <button onClick={() => setReadmeModal(null)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              <pre style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#ccc', whiteSpace: 'pre-wrap', lineHeight: 1.7, margin: 0 }}>{readmeModal.content}</pre>
            </div>
            <div style={{ display: 'flex', gap: 10, padding: '14px 20px', borderTop: '1px solid #2a2a3e' }}>
              <button
                onClick={() => navigator.clipboard.writeText(readmeModal.content)}
                style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, padding: '8px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Copy
              </button>
              <button
                onClick={() => downloadFile(readmeModal.content, 'README.md', 'text/markdown')}
                style={{ background: 'none', color: '#aaa', border: '1px solid #2a2a3e', borderRadius: 6, padding: '8px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, cursor: 'pointer' }}
              >
                Download .md
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
