'use client'
import { Node, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'

function renderIdFromNode(nodeId: string) {
  return `diagram-${nodeId.replace(/[^a-zA-Z0-9_-]/g, '')}`
}

function DiagramNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const [hovered, setHovered] = useState(false)
  const nodeId = String(node.attrs.id || '')
  const dsl = String(node.attrs.dsl || '')
  const renderIdRef = useRef(renderIdFromNode(nodeId || Math.random().toString(36).slice(2)))

  const renderDiagram = useCallback(async (code: string) => {
    try {
      const mermaid = (await import('mermaid')).default
      const { svg: rendered } = await mermaid.render(renderIdRef.current, code)
      setSvg(rendered)
      setError('')
    } catch (err) {
      setSvg('')
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    renderDiagram(dsl)
  }, [dsl, renderDiagram])

  const copyDsl = useCallback(() => {
    navigator.clipboard.writeText(dsl)
  }, [dsl])

  const openEditModal = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('helix:diagram:edit', {
        detail: { id: nodeId, dsl },
      })
    )
  }, [dsl, nodeId])

  return (
    <NodeViewWrapper>
      <div
        className="mermaid-block"
        data-diagram-id={nodeId}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ position: 'relative' }}
      >
        {(hovered || selected) && (
          <button
            onClick={openEditModal}
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              zIndex: 2,
              background: '#1a1a2e',
              border: '1px solid #00d4a1',
              borderRadius: '4px',
              color: '#00d4a1',
              cursor: 'pointer',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '10px',
              padding: '2px 8px',
            }}
          >
            Edit
          </button>
        )}

        {selected && (
          <div
            style={{
              position: 'absolute',
              top: '-34px',
              left: '0',
              background: '#1a1a2e',
              border: '1px solid #00d4a1',
              borderRadius: '4px',
              display: 'flex',
              gap: '4px',
              padding: '3px',
              zIndex: 3,
            }}
          >
            <button onClick={openEditModal} style={toolbarBtnStyle}>Edit</button>
            <button onClick={copyDsl} style={toolbarBtnStyle}>Copy DSL</button>
            <button
              onClick={() => deleteNode()}
              style={{ ...toolbarBtnStyle, color: '#f87171', borderColor: '#f87171' }}
            >
              Delete
            </button>
          </div>
        )}

        <div className="mermaid-block__header">
          <span>◈ diagram</span>
        </div>
        <div className="mermaid-block__content" style={{ background: '#12121f' }}>
          {error ? (
            <div style={{ color: '#f87171', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace' }}>
              ⚠ {error}
            </div>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: svg }} style={{ overflowX: 'auto' }} />
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}

const toolbarBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #00d4a1',
  borderRadius: '3px',
  color: '#00d4a1',
  cursor: 'pointer',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: '10px',
  padding: '2px 7px',
}

export const DiagramNodeExtension = Node.create({
  name: 'diagramNode',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      dsl: { default: 'graph TD\n  A[Start] --> B[End]' },
      id: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-diagram-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      {
        'data-diagram-id': HTMLAttributes.id,
        'data-dsl': HTMLAttributes.dsl,
      },
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(DiagramNodeView)
  },
})
