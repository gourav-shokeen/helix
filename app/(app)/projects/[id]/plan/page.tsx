'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import {
  addDecision,
  createBoard,
  createSprint,
  getBoard,
  getDecisions,
  getMeetingNotes,
  getSprints,
  saveMeetingNote,
  updateMeetingNote,
} from '@/lib/supabase/projects'
import { KanbanBoard, defaultBoardData, type KanbanBoardData } from '@/components/editor/KanbanBoard'

type Tab = 'board' | 'sprint' | 'decisions' | 'notes'

interface SprintRow {
  id: string
  name: string
  start_date: string
  end_date: string
}

interface DecisionRow {
  id: string
  body: string
  created_at: string
}

interface NoteRow {
  id: string
  content: string
  sprint_id?: string | null
  created_at: string
}

export default function ProjectPlanPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>('board')

  const [boardId, setBoardId] = useState<string>('')
  const [boardData, setBoardData] = useState<KanbanBoardData>(defaultBoardData())
  const [boardLoading, setBoardLoading] = useState(true)

  const [sprints, setSprints] = useState<SprintRow[]>([])
  const [newSprintName, setNewSprintName] = useState('')
  const [newSprintStart, setNewSprintStart] = useState('')
  const [newSprintEnd, setNewSprintEnd] = useState('')

  const [decisions, setDecisions] = useState<DecisionRow[]>([])
  const [decisionSearch, setDecisionSearch] = useState('')
  const [decisionModalOpen, setDecisionModalOpen] = useState(false)
  const [decisionBody, setDecisionBody] = useState('')
  const [decisionSummary, setDecisionSummary] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)

  const [notes, setNotes] = useState<NoteRow[]>([])
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [focusCardTitle, setFocusCardTitle] = useState<string | null>(null)
  const [newNoteLoading, setNewNoteLoading] = useState(false)

  useEffect(() => {
    if (!projectId) return
    const load = async () => {
      setBoardLoading(true)
      const { data } = await getBoard(projectId)
      if (data?.id) {
        setBoardId(data.id)
        setBoardData((data.data as KanbanBoardData) || defaultBoardData())
      } else {
        const { data: created } = await createBoard(projectId, defaultBoardData())
        if (created?.id) {
          setBoardId(created.id)
          setBoardData((created.data as KanbanBoardData) || defaultBoardData())
        }
      }
      setBoardLoading(false)
    }
    void load()
  }, [projectId])

  useEffect(() => {
    if (!projectId) return
    void getSprints(projectId).then(({ data }) => setSprints((data || []) as SprintRow[]))
    void getDecisions(projectId).then(({ data }) => setDecisions((data || []) as DecisionRow[]))
    void getMeetingNotes(projectId).then(({ data }) => setNotes((data || []) as NoteRow[]))
  }, [projectId])

  const activeSprint = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return sprints.find(s => s.start_date <= today && s.end_date >= today) || null
  }, [sprints])

  const cards = useMemo(() => {
    const columns = boardData.columns
    return [...columns.idea, ...columns.building, ...columns.testing, ...columns.done]
  }, [boardData.columns])

  const sprintProgress = useCallback((sprint: SprintRow) => {
    const inRange = cards.filter(card => {
      const created = (card.createdAt || '').slice(0, 10)
      if (!created) return true
      return created >= sprint.start_date && created <= sprint.end_date
    })
    const doneIds = new Set(boardData.columns.done.map(card => card.id))
    const doneCount = inRange.filter(card => doneIds.has(card.id)).length
    const total = inRange.length
    const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0
    return { doneCount, total, percent }
  }, [boardData.columns.done, cards])

  const handleCreateSprint = async () => {
    if (!newSprintName.trim() || !newSprintStart || !newSprintEnd) return
    const { data } = await createSprint(projectId, newSprintName.trim(), newSprintStart, newSprintEnd)
    if (data) {
      setSprints(prev => [data as SprintRow, ...prev])
      setNewSprintName('')
      setNewSprintStart('')
      setNewSprintEnd('')
    }
  }

  const handleAddDecision = async () => {
    const body = decisionBody.trim()
    if (!body) return
    const { data } = await addDecision(projectId, body)
    if (data) {
      setDecisions(prev => [data as DecisionRow, ...prev])
      setDecisionBody('')
      setDecisionModalOpen(false)
    }
  }

  const handleSummarise = async () => {
    if (decisions.length === 0) return
    setSummaryLoading(true)
    try {
      const res = await fetch('/api/ai/summarise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: decisions.map(d => d.body) }),
      })
      const json = await res.json()
      setDecisionSummary(String(json.summary || json.error || 'No summary generated.'))
    } finally {
      setSummaryLoading(false)
    }
  }

  const handleNewNote = async () => {
    setNewNoteLoading(true)
    const { data } = await saveMeetingNote(projectId, '', activeSprint?.id)
    if (data) {
      const note = data as NoteRow
      setNotes(prev => [note, ...prev])
      setActiveNoteId(note.id)
      setTab('notes')
    }
    setNewNoteLoading(false)
  }

  const activeNote = notes.find(n => n.id === activeNoteId) || null

  const noteEditor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write meeting notes… use [[Card Title]] to link board cards' }),
    ],
    content: activeNote?.content || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      if (!activeNoteId) return
      void updateMeetingNote(activeNoteId, html, activeNote?.sprint_id ?? null)
      setNotes(prev => prev.map(n => n.id === activeNoteId ? { ...n, content: html } : n))
    },
  }, [activeNoteId])

  useEffect(() => {
    if (!noteEditor) return
    noteEditor.commands.setContent(activeNote?.content || '')
  }, [activeNote?.content, noteEditor])

  const decisionFiltered = decisions.filter(item => item.body.toLowerCase().includes(decisionSearch.toLowerCase()))

  const notePreview = (html: string) => {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    return text.slice(0, 80) + (text.length > 80 ? '…' : '')
  }

  const renderNoteWithCardPills = (html: string) => {
    const text = html.replace(/<[^>]+>/g, ' ')
    const parts = text.split(/(\[\[.*?\]\])/g)
    const titles = new Set(cards.map(c => c.title))
    return (
      <>
        {parts.map((part, index) => {
          const match = part.match(/^\[\[(.*?)\]\]$/)
          if (match && titles.has(match[1])) {
            return (
              <button
                key={`${match[1]}-${index}`}
                onClick={() => {
                  setFocusCardTitle(match[1])
                  setTab('board')
                }}
                style={{
                  background: 'var(--accent-dim)',
                  border: '1px solid var(--accent)',
                  borderRadius: 999,
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  fontSize: 10,
                  padding: '1px 7px',
                  marginRight: 4,
                }}
              >
                {match[1]}
              </button>
            )
          }
          return <span key={`${part}-${index}`}>{part}</span>
        })}
      </>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'JetBrains Mono, monospace' }}>
      <header style={{ height: 44, borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', padding: '0 1rem', gap: '0.8rem' }}>
        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>⬡ Helix</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>/ projects / {projectId} / plan</span>
      </header>

      <div style={{ display: 'flex', gap: 6, padding: '0 1rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {(['board', 'sprint', 'decisions', 'notes'] as Tab[]).map(item => (
          <button key={item} onClick={() => setTab(item)} style={{ background: 'none', border: 'none', borderBottom: tab === item ? '2px solid var(--accent)' : '2px solid transparent', color: tab === item ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', padding: '0.55rem 0.9rem', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>
            {item === 'board' ? 'Board' : item === 'sprint' ? 'Sprint' : item === 'decisions' ? 'Decisions' : 'Notes'}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '1.25rem' }}>
        {tab === 'board' && (
          <>
            {boardLoading || !boardId ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading board…</div>
            ) : (
              <KanbanBoard boardId={boardId} projectId={projectId} onDataChange={setBoardData} focusCardTitle={focusCardTitle} />
            )}
          </>
        )}

        {tab === 'sprint' && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.9rem' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 8 }}>New Sprint</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input value={newSprintName} onChange={e => setNewSprintName(e.target.value)} placeholder="Sprint name" style={inputStyle} />
                <input type="date" value={newSprintStart} onChange={e => setNewSprintStart(e.target.value)} style={inputStyle} />
                <input type="date" value={newSprintEnd} onChange={e => setNewSprintEnd(e.target.value)} style={inputStyle} />
                <button onClick={handleCreateSprint} style={primaryBtnStyle}>New Sprint</button>
              </div>
            </div>

            {sprints.map(sprint => {
              const p = sprintProgress(sprint)
              const isActive = activeSprint?.id === sprint.id
              return (
                <div key={sprint.id} style={{ background: isActive ? 'var(--accent-dim)' : 'var(--surface)', border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: isActive ? 'var(--accent)' : 'var(--text-primary)', fontSize: 13, fontWeight: 700 }}>{sprint.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{sprint.start_date} → {sprint.end_date}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: '#12121f', overflow: 'hidden' }}>
                    <div style={{ width: `${p.percent}%`, height: '100%', background: 'var(--accent)' }} />
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 4 }}>{p.doneCount}/{p.total} done ({p.percent}%)</div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'decisions' && (
          <div style={{ display: 'grid', gap: '0.9rem' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={decisionSearch} onChange={e => setDecisionSearch(e.target.value)} placeholder="Search decisions" style={{ ...inputStyle, flex: 1 }} />
              <button onClick={() => setDecisionModalOpen(true)} style={primaryBtnStyle}>Add decision</button>
              <button onClick={handleSummarise} style={secondaryBtnStyle}>{summaryLoading ? 'Summarising…' : 'Summarise'}</button>
            </div>

            {decisionSummary && (
              <div style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 8, padding: '0.8rem', color: 'var(--text-primary)', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                {decisionSummary}
              </div>
            )}

            {decisionFiltered.map(item => (
              <div key={item.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem 0.9rem' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 4 }}>{new Date(item.created_at).toLocaleString()}</div>
                <div style={{ color: 'var(--text-primary)', fontSize: 12, whiteSpace: 'pre-wrap' }}>{item.body}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'notes' && (
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1rem' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Meeting Notes</span>
                <button onClick={handleNewNote} style={secondaryBtnStyle}>{newNoteLoading ? '…' : 'New Note'}</button>
              </div>
              <div style={{ maxHeight: 520, overflowY: 'auto' }}>
                {notes.map(note => (
                  <button key={note.id} onClick={() => setActiveNoteId(note.id)} style={{ width: '100%', border: 'none', borderLeft: activeNoteId === note.id ? '2px solid var(--accent)' : '2px solid transparent', background: activeNoteId === note.id ? 'var(--accent-dim)' : 'none', textAlign: 'left', cursor: 'pointer', padding: '0.6rem 0.75rem' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{new Date(note.created_at).toLocaleDateString()}</div>
                    <div style={{ color: 'var(--text-primary)', fontSize: 11, marginTop: 3 }}>
                      {renderNoteWithCardPills(notePreview(note.content))}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, minHeight: 420, padding: '0.75rem' }}>
              {activeNote ? (
                <EditorContent editor={noteEditor} />
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Select a note to edit.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {decisionModalOpen && (
        <div onClick={() => setDecisionModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 220 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 500, maxWidth: '92vw', background: '#0d0d1a', border: '1px solid var(--border)', borderRadius: 8, padding: '1rem' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8 }}>Add decision</div>
            <textarea value={decisionBody} onChange={e => setDecisionBody(e.target.value)} rows={5} placeholder="Decision details" style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDecisionModalOpen(false)} style={secondaryBtnStyle}>Cancel</button>
              <button onClick={handleAddDecision} style={primaryBtnStyle}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: '#12121f',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-primary)',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 12,
  outline: 'none',
  padding: '0.4rem 0.55rem',
}

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--accent)',
  border: 'none',
  borderRadius: 4,
  color: 'var(--status-text)',
  cursor: 'pointer',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11,
  fontWeight: 700,
  padding: '0.4rem 0.8rem',
}

const secondaryBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11,
  padding: '0.35rem 0.75rem',
}
