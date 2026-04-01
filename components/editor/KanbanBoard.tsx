'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import React from 'react'

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

export const defaultBoardData = (): KanbanBoardData => ({
  columns: {
    idea: [],
    building: [],
    testing: [],
    done: [],
  },
})

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

export const KanbanBoard = React.memo(function KanbanBoard({ boardId, projectId, compact = false, onDataChange, externalData, focusCardTitle }: KanbanBoardProps) {
  const supabase = useMemo(() => createClient(), [])
  const [boardData, setBoardData] = useState<KanbanBoardData>(defaultBoardData())
  const [loading, setLoading] = useState(true)
  const [addingTo, setAddingTo] = useState<KanbanColumnKey | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [selectedCard, setSelectedCard] = useState<{ col: KanbanColumnKey; card: KanbanCardItem } | null>(null)
  const dragRef = useRef<{ cardId: string; fromCol: KanbanColumnKey } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null) // ← ref for the scroll container

  // ── Mouse wheel → horizontal scroll ──────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      // only hijack when deltaY is dominant (pure vertical wheel)
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        el.scrollLeft += e.deltaY
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  // ─────────────────────────────────────────────────────────────────────────

  const mergeData = useCallback((raw: unknown): KanbanBoardData => {
    if (!raw || typeof raw !== 'object') return defaultBoardData()
    const candidate = raw as Partial<KanbanBoardData>
    const cols = (candidate.columns ?? {}) as { idea: any[], building: any[], testing: any[], done: any[] }
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
    const { error } = await supabase
      .from('project_boards')
      .update({ data: next })
      .eq('id', boardId)
    if (error) {
      console.error('[kanban] persistBoard failed:', error)
    }
  }, [boardId, onDataChange, supabase])

  const loadBoard = useCallback(async () => {
    if (externalData) {
      setBoardData(mergeData(externalData))
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('project_boards')
      .select('data')
      .eq('id', boardId)
      .maybeSingle()
    if (error) console.error('[kanban] loadBoard failed:', error)
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

    return () => {
      supabase.removeChannel(channel)
    }
  }, [boardId, projectId, mergeData, onDataChange, supabase])

  const handleAddCard = async (column: KanbanColumnKey) => {
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
        [column]: [...boardData.columns[column], nextCard],
      },
    }
    void persistBoard(next)
    setNewTitle('')
    setAddingTo(null)
  }

  const handleDragStart = (e: React.DragEvent, cardId: string, fromCol: KanbanColumnKey) => {
    dragRef.current = { cardId, fromCol }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = async (e: React.DragEvent, toCol: KanbanColumnKey) => {
    if (!dragRef.current || dragRef.current.fromCol === toCol) return
    const { cardId, fromCol } = dragRef.current
    const source = boardData.columns[fromCol]
    const card = source.find(c => c.id === cardId)
    if (!card) return
    const nextData = {
      columns: {
        ...boardData.columns,
        [fromCol]: boardData.columns[fromCol].filter(c => c.id !== cardId),
        [toCol]: [...boardData.columns[toCol], card],
      }
    }
    await persistBoard(nextData)
    dragRef.current = null
  }

  const handleUpdateCard = async (updatedCard: KanbanCardItem) => {
    if (!selectedCard) return
    const { col } = selectedCard
    const nextData = {
      columns: {
        ...boardData.columns,
        [col]: boardData.columns[col].map(c => c.id === updatedCard.id ? updatedCard : c)
      }
    }
    await persistBoard(nextData)
    setSelectedCard(null)
  }

  const handleDeleteCard = async () => {
    if (!selectedCard) return
    const { col, card } = selectedCard
    const nextData = {
      columns: {
        ...boardData.columns,
        [col]: boardData.columns[col].filter(c => c.id !== card.id)
      }
    }
    await persistBoard(nextData)
    setSelectedCard(null)
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '12px' }}>Loading board...</div>
  }

  return (
    <div
      ref={scrollRef} // ← attach ref here
      style={{ display: 'flex', gap: '0.9rem', overflowX: 'auto', minHeight: compact ? 300 : 420, paddingBottom: '0.5rem' }}
    >
      {COLUMN_CONFIG.map(({ key, title }) => (
        <Column
          key={key}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, key)}
        >
          <div style={{ padding: '0.75rem', fontWeight: 600, fontSize: '13px', borderBottom: '1px solid var(--border)' }}>
            {title}
          </div>
          <div style={{ padding: '0.5rem', overflowY: 'auto', flex: 1 }}>
            {boardData.columns[key].map(card => (
              <Card
                key={card.id}
                {...card}
                draggable
                onDragStart={(e) => handleDragStart(e, card.id, key)}
                onClick={() => setSelectedCard({ col: key, card })}
                isFocused={focusCardTitle === card.title}
              />
            ))}
            {addingTo === key ? (
              <div style={{ padding: '0.5rem' }}>
                <input
                  type="text"
                  autoFocus
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCard(key)}
                  onBlur={() => setAddingTo(null)}
                  placeholder="New card title..."
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: 'var(--bg)',
                    border: '1px solid var(--accent)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
              </div>
            ) : (
              <button
                onClick={() => setAddingTo(key)}
                style={{
                  width: 'calc(100% - 1rem)',
                  margin: '0.5rem',
                  padding: '0.35rem',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textAlign: 'left',
                }}
              >
                + Add card
              </button>
            )}
          </div>
        </Column>
      ))}
      {selectedCard && (
        <CardDetailModal
          card={selectedCard.card}
          onClose={() => setSelectedCard(null)}
          onUpdate={handleUpdateCard}
          onDelete={handleDeleteCard}
        />
      )}
    </div>
  )
})

function Column({ children, onDragOver, onDrop }: { title?: string, children: React.ReactNode, onDragOver: (e: React.DragEvent) => void, onDrop: (e: React.DragEvent) => void }) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        width: '220px',
        flexShrink: 0,
        background: 'var(--surface)',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 120px)',
      }}
    >
      <div style={{ padding: '0.5rem', overflowY: 'auto', flex: 1 }}>
        {children}
      </div>
    </div>
  )
}

function Card({ title, assignee, label, color, isFocused, ...props }: { title: string, assignee?: string, label?: string, color?: string, isFocused?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      draggable
      {...props}
      style={{
        padding: '0.75rem',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        marginBottom: '0.5rem',
        cursor: 'pointer',
        boxShadow: isFocused ? '0 0 0 2px var(--accent)' : 'none',
        transition: 'box-shadow 0.2s',
      }}
    >
      <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '0.5rem' }}>{title}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {label && (
          <span style={{
            padding: '2px 6px',
            background: color || LABEL_COLORS[0],
            color: '#fff',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 500,
          }}>
            {label}
          </span>
        )}
        {assignee && (
          <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#ccc', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 600 }}>
            {assignee.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>
    </div>
  )
}

function CardDetailModal({ card, onClose, onUpdate, onDelete }: { card: KanbanCardItem, onClose: () => void, onUpdate: (card: KanbanCardItem) => void, onDelete: () => void }) {
  const [editedCard, setEditedCard] = useState(card)

  const handleSave = () => {
    onUpdate(editedCard)
  }

  return (
    <>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000 }} onClick={onClose} />
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '360px',
        height: 'auto',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '1rem',
        overflowY: 'auto',
        zIndex: 1001,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Edit Card</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'var(--text-muted)' }}>&times;</button>
        </div>

        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '12px', color: 'var(--text-muted)' }}>Title</label>
        <input
          type="text"
          value={editedCard.title}
          onChange={e => setEditedCard({ ...editedCard, title: e.target.value })}
          style={{ width: '100%', padding: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)', fontSize: '14px', marginBottom: '1rem' }}
        />

        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '12px', color: 'var(--text-muted)' }}>Description</label>
        <textarea
          value={editedCard.description || ''}
          onChange={e => setEditedCard({ ...editedCard, description: e.target.value })}
          style={{ width: '100%', minHeight: '80px', padding: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)', fontSize: '14px', marginBottom: '1rem', fontFamily: 'inherit' }}
        />

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '12px', color: 'var(--text-muted)' }}>Assignee</label>
            <input
              type="text"
              value={editedCard.assignee || ''}
              onChange={e => setEditedCard({ ...editedCard, assignee: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)', fontSize: '14px' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '12px', color: 'var(--text-muted)' }}>Due Date</label>
            <input
              type="date"
              value={editedCard.dueDate || ''}
              onChange={e => setEditedCard({ ...editedCard, dueDate: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)', fontSize: '14px' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '12px', color: 'var(--text-muted)' }}>Label</label>
            <input
              type="text"
              value={editedCard.label || ''}
              onChange={e => setEditedCard({ ...editedCard, label: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)', fontSize: '14px' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '12px', color: 'var(--text-muted)' }}>Color</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {LABEL_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setEditedCard({ ...editedCard, color })}
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: color,
                    border: editedCard.color === color ? '2px solid var(--accent)' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={onDelete} style={{ padding: '0.5rem 1rem', background: 'var(--red-solid)', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>Delete</button>
          <div>
            <button onClick={onClose} style={{ marginRight: '0.5rem', padding: '0.5rem 1rem', background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} style={{ padding: '0.5rem 1rem', background: 'var(--accent)', border: 'none', borderRadius: '4px', color: 'var(--status-text)', cursor: 'pointer' }}>Save</button>
          </div>
        </div>
      </div>
    </>
  )
}