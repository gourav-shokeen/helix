'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { TopBar } from '@/components/layout/TopBar'
import { getMyDocuments } from '@/lib/supabase/documents'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useDevlogStore, type DevlogEntry } from '@/store/devlogStore'

interface ProjectOption {
  id: string
  title: string
}

const supabase = createClient()
const MOODS = ['😤', '😐', '🙂', '😄', '🔥']

const todayKey = () => new Date().toISOString().split('T')[0]

const defaultEntryTemplate = () =>
  '<h2>What I built</h2><p></p><h2>What\'s next</h2><p></p><h2>Blockers</h2><p></p>'

function withSummaryInWhatIBuilt(html: string, summary: string) {
  if (typeof window === 'undefined') return html

  const parser = new window.DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const headings = Array.from(doc.querySelectorAll('h2'))
  const target = headings.find((item) => item.textContent?.trim().toLowerCase() === 'what i built')

  const paragraph = doc.createElement('p')
  paragraph.textContent = summary

  if (!target) {
    const title = doc.createElement('h2')
    title.textContent = 'What I built'
    doc.body.prepend(paragraph)
    doc.body.prepend(title)
    return doc.body.innerHTML
  }

  let cursor = target.nextSibling
  while (cursor && !(cursor instanceof window.HTMLHeadingElement && cursor.tagName === 'H2')) {
    cursor = cursor.nextSibling
  }
  target.parentNode?.insertBefore(paragraph, cursor || null)
  return doc.body.innerHTML
}

async function getEntries(userId: string): Promise<DevlogEntry[]> {
  try {
    const { data, error } = await supabase
      .from('dev_logs')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
    if (error) throw error
    return (data ?? []) as DevlogEntry[]
  } catch (err) {
    console.error('[devlog] getEntries failed:', err)
    return []
  }
}

async function upsertEntry(payload: {
  user_id: string
  date: string
  content: string
  project_id: string | null
  mood: string | null
}): Promise<DevlogEntry | null> {
  try {
    const { data, error } = await supabase
      .from('dev_logs')
      .upsert(
        {
          ...payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,date' }
      )
      .select()
      .single()
    if (error) throw error
    return data as DevlogEntry
  } catch (err) {
    console.error('[devlog] upsertEntry failed:', err)
    return null
  }
}

export default function DevLogPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const {
    entries,
    activeDate,
    status,
    setEntries,
    setActiveDate,
    setStatus,
    upsertEntry: upsertInStore,
    patchEntryByDate,
  } = useDevlogStore()

  const [draftHtml, setDraftHtml] = useState(defaultEntryTemplate())
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [saveError, setSaveError] = useState('')
  const [lastSavedAt, setLastSavedAt] = useState<number>(0)
  const [clockTick, setClockTick] = useState(Date.now())
  const [aiOpen, setAiOpen] = useState(true)
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [commitInput, setCommitInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [sidebarLoading, setSidebarLoading] = useState(true)

  const draftRef = useRef(draftHtml)
  draftRef.current = draftHtml
  const activeDateRef = useRef(activeDate)
  activeDateRef.current = activeDate

  const activeEntry = useMemo(
    () => entries.find((entry) => entry.date === activeDate) || null,
    [entries, activeDate]
  )

  const metadataRef = useRef({ mood: activeEntry?.mood ?? null, projectId: activeEntry?.project_id ?? null })
  metadataRef.current = { mood: activeEntry?.mood ?? null, projectId: activeEntry?.project_id ?? null }

  const saveRef = useRef<(silent?: boolean) => Promise<void>>(async () => {})

  const editorConfig = useMemo(
    () => ({
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: 'Write your daily log…' }),
      ],
      content: defaultEntryTemplate(),
      onUpdate: ({ editor: tiptapEditor }: { editor: { getHTML: () => string } }) => {
        setDraftHtml(tiptapEditor.getHTML())
      },
      onBlur: () => {
        void saveRef.current(false)
      },
    }),
    []
  )

  const editor = useEditor(editorConfig, [])

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  useEffect(() => {
    if (!user?.id) return

    setSidebarLoading(true)
    void getEntries(user.id).then((data) => {
      setEntries(data)
      setSidebarLoading(false)
    })

    void getMyDocuments(user.id).then(({ data }) => {
      const options = (data || []).map((doc) => ({ id: String(doc.id), title: String(doc.title || 'Untitled') }))
      setProjects(options)
    })
  }, [user?.id, setEntries])

  useEffect(() => {
    if (!editor) return
    const entry = entries.find((item) => item.date === activeDate)
    const nextHtml = entry?.content || defaultEntryTemplate()
    setDraftHtml(nextHtml)
    editor.commands.setContent(nextHtml, { emitUpdate: false })
  }, [activeDate, entries, editor])

  const save = useCallback(async (silent = false) => {
    if (!user?.id) return

    setStatus('saving')
    setSaveError('')
    const result = await upsertEntry({
      user_id: user.id,
      date: activeDateRef.current,
      content: draftRef.current,
      project_id: metadataRef.current.projectId,
      mood: metadataRef.current.mood,
    })

    if (result) {
      upsertInStore(result)
      setStatus('idle')
      setLastSavedAt(Date.now())
    } else {
      setStatus('error')
      setSaveError('Save failed — check your connection.')
    }
    if (!silent && result) setStatus('idle')
  }, [user?.id, setStatus, upsertInStore])

  saveRef.current = save

  useEffect(() => {
    const saveTimer = setInterval(() => {
      void saveRef.current(true)
    }, 20_000)
    return () => clearInterval(saveTimer)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setClockTick(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [save])

  const saveLabel = useMemo(() => {
    if (status === 'saving') return 'Saving...'
    if (status === 'error') return 'Save failed'
    if (!lastSavedAt) return 'Unsaved changes'

    const seconds = Math.max(0, Math.floor((clockTick - lastSavedAt) / 1000))
    return `Saved · ${seconds}s ago`
  }, [status, lastSavedAt, clockTick])

  const dates = useMemo(() => {
    const set = new Set(entries.map((entry) => entry.date))
    set.add(todayKey())
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1))
  }, [entries])

  const applyMood = (mood: string) => {
    patchEntryByDate(activeDate, {
      date: activeDate,
      content: draftRef.current,
      mood,
      project_id: activeEntry?.project_id ?? null,
    })
    metadataRef.current = { ...metadataRef.current, mood }
    void save(false)
  }

  const applyProject = (projectId: string) => {
    const value = projectId || null
    patchEntryByDate(activeDate, {
      date: activeDate,
      content: draftRef.current,
      project_id: value,
      mood: activeEntry?.mood ?? null,
    })
    metadataRef.current = { ...metadataRef.current, projectId: value }
    void save(false)
  }

  const handleGenerateSummary = async () => {
    const commits = commitInput.trim()
    if (!commits) return

    setAiLoading(true)
    try {
      const response = await fetch('/api/ai/devlog-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commits }),
      })
      const json = await response.json()
      const summary = String(json.summary || json.error || '').trim()
      if (!summary || !editor) return

      const next = withSummaryInWhatIBuilt(editor.getHTML(), summary)
      editor.commands.setContent(next, { emitUpdate: false })
      setDraftHtml(next)
      setAiModalOpen(false)
      setCommitInput('')
      void save(false)
    } finally {
      setAiLoading(false)
    }
  }

  if (loading || !user) return null

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans), system-ui, sans-serif' }}>
      <TopBar docTitle="Dev Log" onTitleChange={() => {}} showDoc />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside style={{ width: '240px', borderRight: '1px solid var(--border)', background: 'var(--surface)', overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ padding: '0.6rem 0.75rem', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)' }}>
            Entries
          </div>
          {sidebarLoading ? (
            <div style={{ padding: '0.5rem 0.75rem', fontSize: '11px', color: 'var(--text-muted)' }}>loading…</div>
          ) : dates.map((date) => (
            <div
              key={date}
              onClick={() => setActiveDate(date)}
              style={{
                padding: '0.5rem 0.75rem',
                cursor: 'pointer',
                fontSize: '12px',
                color: activeDate === date ? 'var(--accent)' : 'var(--text-secondary)',
                background: activeDate === date ? '#1a1a2e' : 'none',
                borderBottom: '1px solid var(--border)',
                borderLeft: activeDate === date ? '3px solid var(--accent)' : '3px solid transparent',
              }}
            >
              {date}
            </div>
          ))}
        </aside>

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{activeDate}</span>

            <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
              {MOODS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => applyMood(emoji)}
                  style={{
                    background: activeEntry?.mood === emoji ? 'var(--accent-dim)' : 'transparent',
                    border: activeEntry?.mood === emoji ? '1px solid var(--accent)' : '1px solid var(--border)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 14,
                    padding: '2px 6px',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <select
              value={activeEntry?.project_id || ''}
              onChange={(event) => applyProject(event.target.value)}
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', fontSize: 11, padding: '0.2rem 0.45rem', marginLeft: 8 }}
            >
              <option value="">Link project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.title}</option>
              ))}
            </select>

            <span style={{ flex: 1 }} />
            {saveError && <span style={{ fontSize: '11px', color: 'var(--red)' }}>{saveError}</span>}
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{saveLabel}</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', padding: '0.9rem 1rem', minHeight: 360 }}>
              <EditorContent editor={editor} />
            </div>

            <div style={{ marginTop: '0.9rem', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <button
                onClick={() => setAiOpen((prev) => !prev)}
                style={{ width: '100%', background: 'var(--surface)', border: 'none', borderBottom: aiOpen ? '1px solid var(--border)' : 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-sans), system-ui, sans-serif', fontSize: 12, padding: '0.55rem 0.75rem' }}
              >
                <span>AI</span>
                <span>{aiOpen ? '−' : '+'}</span>
              </button>

              {aiOpen && (
                <div style={{ padding: '0.75rem' }}>
                  <button
                    onClick={() => setAiModalOpen(true)}
                    style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 6, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font-sans), system-ui, sans-serif', fontSize: 11, padding: '0.45rem 0.75rem' }}
                  >
                    Generate from git commits
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {aiModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ width: 'min(760px, 95vw)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)' }}>
              Paste `git log --oneline -20`
            </div>
            <textarea
              value={commitInput}
              onChange={(event) => setCommitInput(event.target.value)}
              placeholder="a1b2c3d feat: add slash /brain&#10;d4e5f6a fix: realtime thread refresh&#10;..."
              style={{ width: '100%', height: 220, background: 'var(--bg)', border: 'none', color: 'var(--text-primary)', fontFamily: 'var(--font-mono), monospace', fontSize: 12, lineHeight: 1.6, outline: 'none', padding: '0.75rem' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0.55rem 0.75rem', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setAiModalOpen(false)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: '0.4rem 0.75rem' }}>Cancel</button>
              <button onClick={handleGenerateSummary} disabled={aiLoading} style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, color: 'var(--status-text)', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '0.4rem 0.75rem' }}>{aiLoading ? 'Generating…' : 'Generate'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
