'use client'
// app/(app)/doc/[id]/page.tsx — Main Editor Page
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { usePomodoro } from '@/hooks/usePomodoro'
import { useFocusMode } from '@/hooks/useFocusMode'
import { usePresence } from '@/hooks/usePresence'
import { getMyDocuments, deleteDocument, createDocument, updateDocumentTitle } from '@/lib/supabase/documents'
import { getBoardById } from '@/lib/supabase/projects'
import { downloadFile } from '@/lib/utils'
import { renderDiagramsForExport } from '@/lib/diagramExport'  // ✅ NEW
import { TopBar } from '@/components/layout/TopBar'
import { Sidebar } from '@/components/layout/Sidebar'
import { StatusBar } from '@/components/layout/StatusBar'
import { CommandPalette } from '@/components/ui/CommandPalette'
import { ShareModal } from '@/components/ui/ShareModal'
import type { Document, KanbanColumn, KanbanCard } from '@/types'

import dynamic from 'next/dynamic'

const EditorWrapper = dynamic(
  () => import('@/components/editor/EditorWrapper').then(m => ({ default: m.EditorWrapper })),
  {
    ssr: false,
    loading: () => (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-sans), system-ui, sans-serif',
        fontSize: 12
      }}>
        loading editor...
      </div>
    )
  }
)

const RightPanel = dynamic(
  () => import('@/components/layout/RightPanel').then(m => ({ default: m.RightPanel })),
  { ssr: false }
)

export default function DocPage() {
  const { id } = useParams<{ id: string }>()
  const { user, loading } = useAuth()
  const router = useRouter()

  const [docs, setDocs] = useState<Document[]>([])
  const [provider, setProvider] = useState<unknown>(null)
  const [wordCount, setWordCount] = useState(0)
  const [commandOpen, setCommandOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [sessionOverlay, setSessionOverlay] = useState<'break' | 'after-break' | null>(null)
  const [readmeModal, setReadmeModal] = useState<{ content: string; title: string } | null>(null)

  const [saving, setSaving] = useState(false)
  const [currentDoc, setCurrentDoc] = useState<Document | null>(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)

  const { isFocused, toggle: toggleFocusStore } = useFocusMode()
  const pomodoro = usePomodoro()
  const onlineUsers = usePresence(provider)

  const toggleFocus = useCallback(() => {
    if (!isFocused) {
      pomodoro.start()
    } else {
      pomodoro.stop()
      setSessionOverlay(null)
    }
    toggleFocusStore()
  }, [isFocused, pomodoro, toggleFocusStore])

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

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  useEffect(() => {
    // Use the server-side API route which has SSR cookie-based auth.
    // This works reliably for collaborators: the browser Supabase client can
    // miss the auth session on first render (timing race), causing the RLS
    // member check to fail and returning null → title shows "Untitled".
    if (!id || !user) return
    fetch(`/api/documents/${id}`)
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(({ document }) => setCurrentDoc(document as Document ?? null))
      .catch(err => console.error('[DocPage] fetch document error:', err))
  }, [id, user])

  useEffect(() => {
    if (!user) return
    getMyDocuments(user.id).then(({ data }) => setDocs((data as Document[]) ?? []))
  }, [user])

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
    const input = window.prompt('Document name:')
    if (input === null) return
    const title = input.trim() || 'Untitled'
    const { data } = await createDocument(user.id)
    if (data) {
      if (title !== 'Untitled') await updateDocumentTitle(data.id, title)
      router.push(`/doc/${data.id}`)
    }
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

  // ✅ UPDATED: renders all diagram nodes to PNG before sending to the route
  const handleExportDocx = useCallback(() => {
    const handler = async (e: Event) => {
      window.removeEventListener('helix:editor:json', handler)
      const { json } = (e as CustomEvent<{ json: unknown }>).detail
      if (!json) return

      // Render every diagram DSL → PNG base64 on the client before the request
      const diagramImages = await renderDiagramsForExport(json)

      const res = await fetch('/api/export/docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: json,
          title: currentDoc?.title,
          documentId: id,
          diagramImages,  // ✅ diagrams now travel with the request
        }),
      })
      if (!res.ok) { console.error('DOCX export failed'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(currentDoc?.title ?? 'document').replace(/\s+/g, '-').toLowerCase()}.docx`
      a.click()
      URL.revokeObjectURL(url)
    }
    window.addEventListener('helix:editor:json', handler)
    window.dispatchEvent(new CustomEvent('helix:editor:requestjson'))
  }, [currentDoc, id])

  const handleExportPdf = useCallback(() => {
    const content = document.querySelector('.tiptap-editor')?.innerHTML ?? ''
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) return
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${currentDoc?.title ?? 'Document'}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=DM+Sans:wght@400;600;700&display=swap');
            *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Inter', sans-serif; font-size: 14px; line-height: 1.7; color: #1a1a1a; background: #fff; padding: 60px 80px; max-width: 860px; margin: 0 auto; }
            h1 { font-size: 2rem; font-weight: 700; margin: 1.5em 0 0.5em; }
            h2 { font-size: 1.4rem; font-weight: 600; margin: 1.2em 0 0.4em; }
            h3 { font-size: 1.1rem; font-weight: 600; margin: 1em 0 0.3em; color: #444; }
            p { margin-bottom: 0.8em; }
            ul, ol { padding-left: 1.5em; margin-bottom: 0.8em; }
            li { margin-bottom: 0.25em; }
            blockquote { border-left: 3px solid #00a67d; padding-left: 1em; color: #555; margin: 0.8em 0; }
            code { font-family: 'JetBrains Mono', monospace; background: #f4f4f4; border: 1px solid #ddd; border-radius: 3px; padding: 0.1em 0.35em; font-size: 0.88em; color: #c7254e; }
            pre { background: #f8f8f8; border: 1px solid #ddd; border-left: 3px solid #00a67d; border-radius: 4px; padding: 1em; margin: 0.8em 0; font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 1.6; }
            pre code { background: none; border: none; padding: 0; color: inherit; }
            table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
            th, td { border: 1px solid #ddd; padding: 0.4em 0.75em; text-align: left; font-size: 13px; }
            th { background: #f5f5f5; font-weight: 600; }
            a { color: #00a67d; text-decoration: none; }
            ul[data-type='taskList'] { list-style: none; padding-left: 0; }
            ul[data-type='taskList'] li { display: flex; align-items: flex-start; gap: 0.5em; }
            .code-block-wrapper > *:not(.code-block-content) { display: none !important; }
            .code-block-content { display: block !important; }
            .code-block-content pre { display: block !important; }
            .kanban-block { display: block !important; border: 1px solid #ccc; border-radius: 6px; overflow: hidden; margin: 1em 0; page-break-inside: avoid; }
            .kanban-columns { display: flex !important; min-height: 80px; }
            .kanban-column { display: block !important; flex: 1; border-right: 1px solid #ccc; padding: 0.75em; background: #fafafa; min-width: 0; }
            .kanban-column:last-child { border-right: none; }
            .kanban-column__title { display: flex !important; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #333; margin-bottom: 0.6em; padding-bottom: 0.4em; border-bottom: 1px solid #ddd; }
            .kanban-card { display: block !important; background: #fff; border: 1px solid #ddd; border-radius: 4px; padding: 0.4em 0.6em; margin-bottom: 0.35em; font-size: 12px; color: #1a1a1a; }
            .kanban-column > button, .kanban-column > input, .kanban-card button { display: none !important; }
            .mermaid-block { border: 1px solid #ddd; border-radius: 6px; padding: 1em; margin: 0.8em 0; page-break-inside: avoid; }
            .mermaid-block__header { display: none !important; }
            @media print {
              body { padding: 0; }
              @page { margin: 2cm 2.5cm; size: A4; }
            }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `)
    printWindow.document.close()
    printWindow.onload = () => {
      printWindow.focus()
      printWindow.print()
      printWindow.close()
    }
  }, [currentDoc])

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

  if (loading || !user) return null

  const sidebarWidth = isFocused ? 0 : 205
  const rightPanelWidth = isFocused ? 0 : rightPanelOpen ? 185 : 0

  return (
    <div
      className={isFocused ? 'focus-active' : ''}
      data-focus-mode={isFocused}
      style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <TopBar
        docTitle={currentDoc?.title ?? 'Untitled'}
        onMobileSidebarToggle={() => setMobileSidebarOpen((v) => !v)}
        onTitleChange={async (t) => {
          setCurrentDoc(prev => prev ? { ...prev, title: t } : prev)
          setDocs(prev => prev.map(d => d.id === id ? { ...d, title: t } : d))
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
        onExportDocx={handleExportDocx}
        onExportPdf={handleExportPdf}
        onExportCsv={handleExportCsv}
        onGenerateReadme={handleGenerateReadme}
        onDeleteDoc={handleDeleteDoc}
        onRightPanelToggle={() => setRightPanelOpen((v) => !v)}
        rightPanelOpen={rightPanelOpen}
        showDoc
      />

      {/* ── Main layout row ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minWidth: 0 }}>

        {/* Sidebar */}
        <div className="sidebar-wrapper" style={{ width: sidebarWidth, transition: 'width 0.3s ease', overflow: 'hidden', flexShrink: 0 }}>
          <Sidebar
            docs={docs}
            activeDocId={id}
            onNewDoc={handleNewDoc}
            mobileOpen={mobileSidebarOpen}
            onMobileClose={() => setMobileSidebarOpen(false)}
          />
        </div>

        {/* Editor — takes all remaining space, minWidth:0 prevents flex overflow */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex' }}>
          <EditorWrapper
            documentId={id}
            user={user}
            onWordCount={setWordCount}
            onProviderReady={setProvider}
            isFocused={isFocused}
          />
        </div>
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

      {/* Focus mode — session complete overlay */}
      {isFocused && sessionOverlay === 'break' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,8,16,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0d0d1a', border: '1px solid #2a2a3e', borderRadius: 12, padding: '36px 44px', textAlign: 'center', fontFamily: 'var(--font-sans), system-ui, sans-serif', minWidth: 320 }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>⬡</div>
            <h3 style={{ color: '#e0e0e0', fontSize: 16, marginBottom: 8, fontWeight: 600 }}>Session complete.</h3>
            <p style={{ color: '#666', fontSize: 13, marginBottom: 28 }}>Take a 5 min break.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setSessionOverlay(null)} style={{ background: '#00d4a1', color: '#000', border: 'none', borderRadius: 6, padding: '9px 18px', fontFamily: 'var(--font-sans), system-ui, sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                ◎ Start Break 5 min
              </button>
              <button onClick={toggleFocus} style={{ background: 'none', color: '#666', border: '1px solid #2a2a3e', borderRadius: 6, padding: '9px 18px', fontFamily: 'var(--font-sans), system-ui, sans-serif', fontSize: 12, cursor: 'pointer' }}>
                ✕ Exit Focus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Focus mode — after break overlay */}
      {isFocused && sessionOverlay === 'after-break' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,8,16,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0d0d1a', border: '1px solid #2a2a3e', borderRadius: 12, padding: '36px 44px', textAlign: 'center', fontFamily: 'var(--font-sans), system-ui, sans-serif', minWidth: 280 }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>◉</div>
            <p style={{ color: '#e0e0e0', fontSize: 14, marginBottom: 24 }}>Start another session?</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setSessionOverlay(null)} style={{ background: '#00d4a1', color: '#000', border: 'none', borderRadius: 6, padding: '9px 18px', fontFamily: 'var(--font-sans), system-ui, sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                ▶ Yes, continue
              </button>
              <button onClick={toggleFocus} style={{ background: 'none', color: '#666', border: '1px solid #2a2a3e', borderRadius: 6, padding: '9px 18px', fontFamily: 'var(--font-sans), system-ui, sans-serif', fontSize: 12, cursor: 'pointer' }}>
                ✕ Exit Focus
              </button>
            </div>
          </div>
        </div>
      )}

      {commandOpen && (
        <CommandPalette onClose={() => setCommandOpen(false)} docId={id} docTitle={currentDoc?.title} />
      )}

      {shareOpen && currentDoc && (
        <ShareModal docId={id} isPublic={currentDoc.is_public} onClose={() => setShareOpen(false)} />
      )}

      {/* README modal */}
      {readmeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,8,16,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 24 }}>
          <div style={{ background: '#0d0d1a', border: '1px solid #2a2a3e', borderRadius: 10, width: '100%', maxWidth: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #2a2a3e' }}>
              <span style={{ color: '#e0e0e0', fontFamily: 'var(--font-sans), system-ui, sans-serif', fontSize: 13, fontWeight: 600 }}>▤ Generated README — {readmeModal.title}</span>
              <button onClick={() => setReadmeModal(null)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              <pre style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 12, color: '#ccc', whiteSpace: 'pre-wrap', lineHeight: 1.7, margin: 0 }}>{readmeModal.content}</pre>
            </div>
            <div style={{ display: 'flex', gap: 10, padding: '14px 20px', borderTop: '1px solid #2a2a3e' }}>
              <button onClick={() => navigator.clipboard.writeText(readmeModal.content)} style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, padding: '8px 16px', fontFamily: 'var(--font-sans), system-ui, sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Copy
              </button>
              <button onClick={() => downloadFile(readmeModal.content, 'README.md', 'text/markdown')} style={{ background: 'none', color: '#aaa', border: '1px solid #2a2a3e', borderRadius: 6, padding: '8px 16px', fontFamily: 'var(--font-sans), system-ui, sans-serif', fontSize: 12, cursor: 'pointer' }}>
                Download .md
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}