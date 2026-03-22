'use client'
// components/editor/SlashMenu.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { SLASH_COMMANDS } from '@/lib/constants'
import { createBoard, getBoard } from '@/lib/supabase/projects'
import { defaultBoardData } from './KanbanBoard'

interface SlashMenuProps {
  editor: Editor
  onOpenBrain: () => void
  onOpenDiagram?: () => void
  projectId: string
}

interface Position { top: number; left: number }

function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++
  }
  return qi === q.length
}

export function SlashMenu({ editor, onOpenBrain, onOpenDiagram, projectId }: SlashMenuProps) {
  const [visible, setVisible] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<Position>({ top: 0, left: 0 })
  const [active, setActive] = useState(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const filtered = SLASH_COMMANDS.filter((c) =>
    fuzzyMatch(query, c.title) || fuzzyMatch(query, c.desc)
  )

  const hide = useCallback(() => {
    setVisible(false)
    setQuery('')
    setActive(0)
  }, [])

  const execute = useCallback(
    async (cmd: (typeof SLASH_COMMANDS)[0]) => {
      hide()
      const { from } = editor.state.selection
      const text = editor.state.doc.textBetween(Math.max(0, from - 20), from)
      const slashIdx = text.lastIndexOf('/')
      if (slashIdx !== -1) {
        const deleteFrom = from - (text.length - slashIdx)
        editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run()
      }

      switch (cmd.id) {
        case 'code':
          editor.chain().focus().setCodeBlock({ language: 'typescript' }).run()
          break
        case 'todo':
          editor.chain().focus().toggleTaskList().run()
          break
        case 'table':
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          break
        case 'diagram':
          onOpenDiagram?.()
          break
        case 'kanban': {
          const { data: existing } = await getBoard(projectId)
          let boardId = existing?.id as string | undefined
          if (!boardId) {
            const { data: created } = await createBoard(projectId, defaultBoardData())
            boardId = created?.id as string | undefined
          }
          if (!boardId) break
          editor.chain().focus().insertContent({
            type: 'kanbanBlock',
            attrs: { boardId },
          }).run()
          break
        }
        case 'standup': {
          const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          const html = [
            `<h2>Standup — ${today}</h2>`,
            `<p><strong>✅ What I did</strong></p>`,
            `<p></p>`,
            `<p><strong>🔜 What's next</strong></p>`,
            `<p></p>`,
            `<p><strong>🚧 Blockers</strong></p>`,
            `<p></p>`,
          ].join('')
          editor.chain().focus().insertContent(html).run()
          break
        }
        case 'brain':
          onOpenBrain()
          break
      }
    },
    [editor, hide, onOpenBrain, onOpenDiagram, projectId]
  )

  useEffect(() => {
    const handler = () => {
      const { from } = editor.state.selection
      const text = editor.state.doc.textBetween(Math.max(0, from - 20), from)
      const slashIdx = text.lastIndexOf('/')
      if (slashIdx !== -1 && !text.slice(slashIdx).includes(' ')) {
        const q = text.slice(slashIdx + 1)
        setQuery(q)
        try {
          const coords = editor.view.coordsAtPos(from)
          const { innerHeight } = window
          const menuHeight = Math.min(filtered.length * 48, 300)
          const top = coords.bottom + menuHeight > innerHeight
            ? coords.top - menuHeight - 8
            : coords.bottom + 8
          setPos({ top, left: coords.left })
          setVisible(true)
        } catch (_e) { /* ignore */ }
      } else {
        setVisible(false)
      }
    }

    editor.on('update', handler)
    return () => { editor.off('update', handler) }
  }, [editor, filtered.length])

  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
      else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) execute(filtered[active]) }
      else if (e.key === 'Escape') { hide() }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [visible, filtered, active, execute, hide])

  useEffect(() => {
    if (!visible) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) hide()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [visible, hide])

  useEffect(() => { setActive(0) }, [query])

  if (!visible || filtered.length === 0) return null

  return (
    <div
      ref={menuRef}
      className="helix-fade-in"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 200,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        width: '300px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        maxHeight: '300px',
        overflowY: 'auto',
      }}
    >
      {filtered.map((cmd, i) => (
        <button
          key={cmd.id}
          onClick={() => execute(cmd)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.5rem 0.75rem',
            background: i === active ? 'var(--accent-dim)' : 'none',
            borderLeft: i === active ? '2px solid var(--accent)' : '2px solid transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            minHeight: '44px',
          }}
          onMouseEnter={() => setActive(i)}
        >
          <span style={{ fontSize: '15px', color: 'var(--accent)', flexShrink: 0, width: '20px', textAlign: 'center' }}>{cmd.icon}</span>
          <span style={{ flex: 1, fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>{cmd.title}</span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0, maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cmd.desc}</span>
        </button>
      ))}
    </div>
  )
}