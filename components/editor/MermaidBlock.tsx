'use client'
// components/editor/MermaidBlock.tsx - Custom Tiptap Node extension
import { Node, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_DSL = 'graph TD\n  A[Start] --> B[End]'

function MermaidNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [editing, setEditing] = useState(false)
  const [syntax, setSyntax] = useState((node.attrs.syntax as string) || DEFAULT_DSL)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const mermaidRef = useRef<HTMLDivElement>(null)

  const renderMermaid = useCallback(async (code: string) => {
    if (!code?.trim()) return
    try {
      const mermaid = (await import('mermaid')).default
      mermaid.initialize({ startOnLoad: false, theme: 'dark', themeVariables: { primaryColor: '#00d4a1' } })
      const freshId = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const { svg: rendered } = await mermaid.render(freshId, code)
      setSvg(rendered)
      setError('')
    } catch (e) {
      setError(String(e))
      setSvg('')
    }
  }, [])

  // Render on mount and whenever syntax changes
  useEffect(() => {
    renderMermaid(syntax)
  }, [syntax, renderMermaid])

  // Sync if node attrs change externally (e.g. from DiagramModal update)
  useEffect(() => {
    const incoming = (node.attrs.syntax as string) || DEFAULT_DSL
    setSyntax(incoming)
  }, [node.attrs.syntax])

  const save = () => {
    setEditing(false)
    updateAttributes({ syntax })
  }

  const copyDSL = () => {
    navigator.clipboard.writeText(syntax)
  }

  return (
    <NodeViewWrapper>
      <div className="mermaid-block" contentEditable={false}>
        {/* Toolbar shown on selection */}
        {selected && (
          <div style={{
            position: 'absolute',
            top: '-35px',
            left: '0',
            background: '#1a1a2e',
            border: '1px solid #00d4a1',
            borderRadius: '4px',
            padding: '0.25rem',
            display: 'flex',
            gap: '0.25rem',
            fontSize: '11px',
            zIndex: 10,
          }}>
            <button onClick={() => setEditing(true)} style={toolbarBtn}>Edit</button>
            <button onClick={copyDSL} style={toolbarBtn}>Copy DSL</button>
            <button onClick={() => deleteNode()} style={{ ...toolbarBtn, color: '#f87171' }}>Delete</button>
          </div>
        )}

        <div className="mermaid-block__header">
          <span>◎ mermaid diagram</span>
          <button
            onClick={() => setEditing((e) => !e)}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '11px' }}
          >
            {editing ? 'preview' : 'edit syntax'}
          </button>
        </div>

        <div className="mermaid-block__content">
          {editing ? (
            <div>
              <textarea
                value={syntax}
                onChange={(e) => setSyntax(e.target.value)}
                rows={6}
                style={{
                  width: '100%',
                  background: 'var(--code-bg)',
                  color: 'var(--text-primary)',
                  border: 'none',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '12px',
                  resize: 'vertical',
                  outline: 'none',
                  padding: '0.5rem',
                }}
              />
              <button
                onClick={save}
                style={{
                  marginTop: '0.4rem',
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: '3px',
                  padding: '0.3rem 0.75rem',
                  color: 'var(--status-text)',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                Render
              </button>
            </div>
          ) : error ? (
            <div style={{ color: 'var(--red)', fontSize: '12px', padding: '0.5rem' }}>⚠ {error}</div>
          ) : svg ? (
            <div dangerouslySetInnerHTML={{ __html: svg }} style={{ overflow: 'auto' }} />
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '0.5rem', fontFamily: 'JetBrains Mono, monospace' }}>
              Rendering diagram...
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}

const toolbarBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#00d4a1',
  cursor: 'pointer',
  padding: '0.2rem 0.4rem',
  borderRadius: '2px',
}

export const MermaidBlockExtension = Node.create({
  name: 'mermaidBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      syntax: {
        default: DEFAULT_DSL,
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mermaid-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-type': 'mermaid-block', ...HTMLAttributes }]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView)
  },
})