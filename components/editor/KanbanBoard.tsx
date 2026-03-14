'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type KanbanColumnKey = 'idea' | 'building' | 'testing' | 'done'

export interface KanbanCardItem {
  id: string
  title: string
  assignee?: string
  label?: string
  color?: string
  dueDate?: string
  description?: string
  createdAt?: string
}

export interface KanbanBoardData {
  columns: Record<KanbanColumnKey, KanbanCardItem[]>
}

const DEFAULT_BOARD: KanbanBoardData = {
  columns: {
    idea: [],
    building: [],
    testing: [],
    done: [],
  },
}

const COLUMN_CONFIG: Array<{ key: KanbanColumnKey; title: string }> = [
  { key: 'idea', title: 'Idea' },
  { key: 'building', title: 'Building' },
  { key: 'testing', title: 'Testing' },
  { key: 'done', title: 'Done' },
]

const LABEL_COLORS = ['#f87171', '#fb923c', '#a78bfa', '#38bdf8', '#00d4a1']

interface KanbanBoardProps {
  boardId: string
  projectId: string
  docId?: string
  compact?: boolean
  onDataChange?: (data: KanbanBoardData) => void
  externalData?: KanbanBoardData | null
  focusCardTitle?: string | null
}

export function KanbanBoard({ boardId, projectId, compact = false, onDataChange, externalData, focusCardTitle }: KanbanBoardProps) {
  const supabase = useMemo(() => createClient(), [])
  const [boardData, setBoardData] = useState<KanbanBoardData>(DEFAULT_BOARD)
  const [loading, setLoading] = useState(true)
  const [addingTo, setAddingTo] = useState<KanbanColumnKey | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [selectedCard, setSelectedCard] = useState<{ col: KanbanColumnKey; card: KanbanCardItem } | null>(null)
  const dragRef = useRef<{ cardId: string; fromCol: KanbanColumnKey } | null>(null)

  const mergeData = useCallback((raw: unknown): KanbanBoardData => {
    if (!raw || typeof raw !== 'object') return DEFAULT_BOARD
    const candidate = raw as Partial<KanbanBoardData>
    const cols = candidate.columns ?? {}
    return {
      columns: {
        idea: Array.isArray(cols.idea) ? cols.idea : [],
        building: Array.isArray(cols.building) ? cols.building : [],
        testing: Array.isArray(cols.testing) ? cols.testing : [],
        done: Array.isArray(cols.done) ? cols.done : [],
      },
    }
  }, [])

  const persistBoard = useCallback(async (next: KanbanBoardData) => {
    setBoardData(next)
    onDataChange?.(next)
    await supabase.from('project_boards').update({ data: next, updated_at: new Date().toISOString() }).eq('id', boardId)
  }, [boardId, onDataChange, supabase])

  const loadBoard = useCallback(async () => {
    if (externalData) {
      setBoardData(mergeData(externalData))
      setLoading(false)
      return
    }
    const { data } = await supabase.from('project_boards').select('data').eq('id', boardId).maybeSingle()
    setBoardData(mergeData(data?.data))
    setLoading(false)
  }, [boardId, externalData, mergeData, supabase])

  useEffect(() => {
    loadBoard()
  }, [loadBoard])

  useEffect(() => {
    const channel = supabase
      .channel(`board:${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_boards', filter: `project_id=eq.${projectId}` }, payload => {
        const next = mergeData((payload.new as { data?: unknown })?.data)
        setBoardData(next)
        onDataChange?.(next)
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [mergeData, onDataChange, projectId, supabase])

  const moveCard = useCallback((cardId: string, fromCol: KanbanColumnKey, toCol: KanbanColumnKey) => {
    if (fromCol === toCol) return
    const source = boardData.columns[fromCol]
    const target = boardData.columns[toCol]
    const card = source.find(c => c.id === cardId)
    if (!card) return

    const next: KanbanBoardData = {
      columns: {
        ...boardData.columns,
        [fromCol]: source.filter(c => c.id !== cardId),
        [toCol]: [...target, card],
      },
    }
    void persistBoard(next)
  }, [boardData.columns, persistBoard])

  const addCard = useCallback((col: KanbanColumnKey) => {
    const title = newTitle.trim()
    if (!title) return
    const nextCard: KanbanCardItem = {
      id: crypto.randomUUID(),
      title,
      color: LABEL_COLORS[0],
      createdAt: new Date().toISOString(),
    }

    const next: KanbanBoardData = {
      columns: {
        ...boardData.columns,
        [col]: [...boardData.columns[col], nextCard],
      },
    }
    void persistBoard(next)
    setNewTitle('')
    setAddingTo(null)
  }, [boardData.columns, newTitle, persistBoard])

  const updateSelectedCard = useCallback((patch: Partial<KanbanCardItem>) => {
    if (!selectedCard) return
    const { col, card } = selectedCard
    const nextCard = { ...card, ...patch }
    setSelectedCard({ col, card: nextCard })
    const next: KanbanBoardData = {
      columns: {
        ...boardData.columns,
        [col]: boardData.columns[col].map(c => c.id === card.id ? nextCard : c),
      },
    }
    void persistBoard(next)
  }, [boardData.columns, persistBoard, selectedCard])

  const deleteSelectedCard = useCallback(() => {
    if (!selectedCard) return
    const { col, card } = selectedCard
    const next: KanbanBoardData = {
      columns: {
        ...boardData.columns,
        [col]: boardData.columns[col].filter(c => c.id !== card.id),
      },
    }
    void persistBoard(next)
    setSelectedCard(null)
  }, [boardData.columns, persistBoard, selectedCard])

  useEffect(() => {
    const title = (focusCardTitle || '').trim().toLowerCase()
    if (!title) return
    const columns = boardData.columns
    const keys: KanbanColumnKey[] = ['idea', 'building', 'testing', 'done']
    for (const key of keys) {
      const match = columns[key].find(card => card.title.trim().toLowerCase() === title)
      if (match) {
        setSelectedCard({ col: key, card: match })
        break
      }
    }
  }, [boardData.columns, focusCardTitle])

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading board…</div>
  }

  return (
    <div style={{ display: 'flex', gap: '0.9rem', overflowX: 'auto', minHeight: compact ? 300 : 420, paddingBottom: '0.5rem' }}>
      {COLUMN_CONFIG.map(({ key, title }) => (
        <div
          key={key}
          onDragOver={e => e.preventDefault()}
          onDrop={() => {
            const drag = dragRef.current
            if (!drag) return
            moveCard(drag.cardId, drag.fromCol, key)
            dragRef.current = null
          }}
          style={{
            minWidth: compact ? 230 : 260,
            background: '#1a1a2e',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700 }}>{title}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{boardData.columns[key].length}</span>
          </div>

          {boardData.columns[key].map(card => (
            <div
              key={card.id}
              draggable
              onDragStart={() => { dragRef.current = { cardId: card.id, fromCol: key } }}
              onClick={() => setSelectedCard({ col: key, card })}
              style={{
                background: '#0d0d1a',
                border: '1px solid var(--border)',
                borderLeft: `3px solid ${card.color || '#00d4a1'}`,
                borderRadius: 6,
                padding: '0.55rem 0.65rem',
                marginBottom: '0.5rem',
                cursor: 'grab',
                opacity: dragRef.current?.cardId === card.id ? 0.5 : 1,
              }}
            >
              <div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 600 }}>{card.title}</div>
              {!!card.assignee && <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>@{card.assignee}</div>}
              {!!card.dueDate && <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>Due {card.dueDate}</div>}
            </div>
          ))}

          {addingTo === key ? (
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addCard(key)
                if (e.key === 'Escape') setAddingTo(null)
              }}
              placeholder="Card title"
              style={{
                width: '100%',
                background: '#0d0d1a',
                border: '1px solid #00d4a1',
                borderRadius: 4,
                padding: '0.35rem 0.5rem',
                color: 'var(--text-primary)',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11,
                outline: 'none',
              }}
            />
          ) : (
            <button
              onClick={() => setAddingTo(key)}
              style={{
                width: '100%',
                background: 'none',
                border: '1px dashed #00d4a1',
                borderRadius: 5,
                padding: '0.3rem 0.4rem',
                color: '#00d4a1',
                cursor: 'pointer',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11,
              }}
            >
              + Add card
            </button>
          )}
        </div>
      ))}

      {selectedCard && (
        <div
          onClick={() => setSelectedCard(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 210 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              height: '100%',
              width: '360px',
              background: '#0d0d1a',
              borderLeft: '1px solid var(--border)',
              padding: '1rem',
              overflowY: 'auto',
            }}
          >
            <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 8 }}>Card details</div>
            <input value={selectedCard.card.title} onChange={e => updateSelectedCard({ title: e.target.value })} style={inputStyle} placeholder="Title" />
            <input value={selectedCard.card.assignee || ''} onChange={e => updateSelectedCard({ assignee: e.target.value })} style={inputStyle} placeholder="Assignee" />
            <input value={selectedCard.card.label || ''} onChange={e => updateSelectedCard({ label: e.target.value })} style={inputStyle} placeholder="Label" />
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {LABEL_COLORS.map(color => (
                <button key={color} onClick={() => updateSelectedCard({ color })} style={{ width: 18, height: 18, borderRadius: '50%', background: color, border: selectedCard.card.color === color ? '2px solid #fff' : '1px solid #333', cursor: 'pointer' }} />
              ))}
            </div>
            <input type="date" value={selectedCard.card.dueDate || ''} onChange={e => updateSelectedCard({ dueDate: e.target.value })} style={inputStyle} />
            <textarea value={selectedCard.card.description || ''} onChange={e => updateSelectedCard({ description: e.target.value })} style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }} placeholder="Description" />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={deleteSelectedCard} style={{ background: 'none', border: '1px solid #f87171', borderRadius: 4, color: '#f87171', cursor: 'pointer', padding: '0.35rem 0.7rem', fontSize: 11 }}>Delete</button>
              <button onClick={() => setSelectedCard(null)} style={{ background: 'var(--accent)', border: 'none', borderRadius: 4, color: 'var(--status-text)', cursor: 'pointer', padding: '0.35rem 0.7rem', fontSize: 11 }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#12121f',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-primary)',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 12,
  outline: 'none',
  padding: '0.45rem 0.55rem',
  marginBottom: 10,
}

export function defaultBoardData(): KanbanBoardData {
  return JSON.parse(JSON.stringify(DEFAULT_BOARD)) as KanbanBoardData
}
