'use client'
// components/editor/MermaidBlock.tsx - Custom Tiptap Node extension
import { Node, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'

// Mermaid node view component
function MermaidNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [editing, setEditing] = useState(false)
  const [syntax, setSyntax] = useState(node.attrs.syntax as string)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`)

  const renderMermaid = useCallback(async (code: string) => {
    try {
      const mermaid = (await import('mermaid')).default
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mermaid.initialize({ theme: 'dark', themeVariables: { primaryColor: '#00d4a1' } } as any)
      const { svg: rendered } = await mermaid.render(idRef.current, code)
      setSvg(rendered)
      setError('')
    } catch (e) {
      setError(String(e))
      setSvg('')
    }
  }, [])

  useEffect(() => { renderMermaid(syntax) }, [syntax, renderMermaid])

  const save = () => {
    setEditing(false)
    updateAttributes({ syntax })
  }

  const copyDSL = () => {
    navigator.clipboard.writeText(syntax)
  }

  const handleEdit = () => {
    setEditing(true)
  }

  const handleDelete = () => {
    deleteNode()
  }

  return (
    <NodeViewWrapper>
      <div className="mermaid-block" contentEditable={false}>
        {/* NodeView toolbar (shown on selection) */}
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
            zIndex: 10
          }}>
            <button
              onClick={handleEdit}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: '#00d4a1', 
                cursor: 'pointer',
                padding: '0.2rem 0.4rem',
                borderRadius: '2px'
              }}
            >
              Edit
            </button>
            <button
              onClick={copyDSL}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: '#00d4a1', 
                cursor: 'pointer',
                padding: '0.2rem 0.4rem',
                borderRadius: '2px'
              }}
            >
              Copy DSL
            </button>
            <button
              onClick={handleDelete}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: '#f87171', 
                cursor: 'pointer',
                padding: '0.2rem 0.4rem',
                borderRadius: '2px'
              }}
            >
              Delete
            </button>
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
                style={{ width: '100%', background: 'var(--code-bg)', color: 'var(--text-primary)', border: 'none', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', resize: 'vertical', outline: 'none', padding: '0.5rem' }}
              />
              <button
                onClick={save}
                style={{ marginTop: '0.4rem', background: 'var(--accent)', border: 'none', borderRadius: '3px', padding: '0.3rem 0.75rem', color: 'var(--status-text)', cursor: 'pointer', fontSize: '11px' }}
              >
                Render
              </button>
            </div>
          ) : error ? (
            <div style={{ color: 'var(--red)', fontSize: '12px', padding: '0.5rem' }}>⚠ {error}</div>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: svg }} style={{ overflow: 'auto' }} />
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}

// Tiptap Node definition
export const MermaidBlockExtension = Node.create({
  name: 'mermaidBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      syntax: {
        default: 'graph TD\n  A[Start] --> B[End]',
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
