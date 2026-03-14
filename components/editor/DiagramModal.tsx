'use client'
// components/editor/DiagramModal.tsx — Split-pane Mermaid diagram builder
import { useCallback, useEffect, useRef, useState } from 'react'

const TEMPLATES: Record<string, string> = {
  Flowchart: `graph TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Action]
  B -->|No| D[End]`,
  Sequence: `sequenceDiagram
  participant A as Alice
  participant B as Bob
  A->>B: Hello!
  B-->>A: Hi there!`,
  Gantt: `gantt
  title Project Plan
  dateFormat  YYYY-MM-DD
  section Phase 1
  Task A :a1, 2024-01-01, 7d
  Task B :after a1, 5d`,
  ER: `erDiagram
  USERS {
    uuid id PK
    text email
    text name
  }
  DOCUMENTS {
    uuid id PK
    text title
    uuid owner_id FK
  }
  USERS ||--o{ DOCUMENTS : "owns"`,
}

interface DiagramModalProps {
  onInsert: (syntax: string) => void
  onClose: () => void
  initialDsl?: string
  mode?: 'insert' | 'update'
}

export function DiagramModal({ onInsert, onClose, initialDsl, mode = 'insert' }: DiagramModalProps) {
  const [syntax, setSyntax] = useState(initialDsl || TEMPLATES.Flowchart)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const idRef = useRef(`diagram-modal-${Math.random().toString(36).slice(2)}`)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const renderDiagram = useCallback(async (code: string) => {
    try {
      const mermaid = (await import('mermaid')).default
      const { svg: rendered } = await mermaid.render(idRef.current, code)
      setSvg(rendered)
      setError('')
    } catch (e) {
      setError(String(e))
      setSvg('')
    }
  }, [])

  useEffect(() => {
    const next = initialDsl || TEMPLATES.Flowchart
    setSyntax(next)
    // HACK: Defer initial render until after modal animation completes
    setTimeout(() => renderDiagram(next), 100)
  }, [initialDsl, renderDiagram])

  const handleChange = (val: string) => {
    setSyntax(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => renderDiagram(val), 400)
  }

  const handleTemplate = (key: string) => {
    const tmpl = TEMPLATES[key]
    setSyntax(tmpl)
    renderDiagram(tmpl)
  }

  // Keyboard: Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}
      onClick={onClose}
    >
      <div
        className="helix-fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1a1a2e',
          border: '1px solid #00d4a1',
          borderRadius: '8px',
          width: '860px',
          maxWidth: '96vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: '#00d4a1', fontWeight: 700, fontSize: '13px' }}>◎ Diagram Builder</span>
          <div style={{ display: 'flex', gap: '0.4rem', marginLeft: 'auto' }}>
            {Object.keys(TEMPLATES).map((name) => (
              <button
                key={name}
                onClick={() => handleTemplate(name)}
                style={{
                  background: 'var(--surface-hover)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '11px',
                  padding: '0.25rem 0.6rem',
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Split pane */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {/* Left: DSL editor */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '0.4rem 0.75rem', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Mermaid DSL
            </div>
            <textarea
              value={syntax}
              onChange={(e) => handleChange(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1,
                background: '#0d0d1a',
                color: '#e8e8ec',
                border: 'none',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '13px',
                lineHeight: 1.6,
                outline: 'none',
                padding: '1rem',
                resize: 'none',
                caretColor: '#00d4a1',
              }}
            />
          </div>

          {/* Right: Preview */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '0.4rem 0.75rem', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Preview
            </div>
            <div style={{ flex: 1, overflow: 'auto', background: '#0d0d1a', padding: '1rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
              {error ? (
                <div style={{ color: 'var(--red)', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre-wrap' }}>
                  ⚠ {error}
                </div>
              ) : (
                <div dangerouslySetInnerHTML={{ __html: svg }} style={{ maxWidth: '100%' }} />
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', padding: '0.75rem 1rem', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={onClose}
            style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', padding: '0.4rem 0.9rem' }}
          >
            Cancel
          </button>
          <button
            onClick={() => { onInsert(syntax); onClose() }}
            style={{ background: '#00d4a1', border: 'none', borderRadius: '4px', color: '#001a13', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', fontWeight: 700, padding: '0.4rem 0.9rem' }}
          >
            {mode === 'update' ? 'Update' : 'Insert'}
          </button>
        </div>
      </div>
    </div>
  )
}
