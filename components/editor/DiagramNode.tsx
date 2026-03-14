'use client'
import { Node, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getMermaidConfig, fixSvgColors, fixSvgString } from '@/lib/mermaidTheme'

function DiagramNodeView({ node, deleteNode, selected }: NodeViewProps) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const [hovered, setHovered] = useState(false)
  const [scale, setScale] = useState(1)
  const nodeId = String(node.attrs.id || '')
  const dsl = String(node.attrs.dsl || '')
  const renderIdRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`)
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0 })
  const panOffset = useRef({ x: 0, y: 0 })
  const scaleRef = useRef(1)
  const hasUserInteracted = useRef(false)
  const resetTimeoutRef = useRef<number | null>(null)
  const resetRafRef = useRef<number | null>(null)

  const applyTransform = useCallback((s: number) => {
    if (!containerRef.current) return
    containerRef.current.style.transform = `translate(${panOffset.current.x}px, ${panOffset.current.y}px) scale(${s})`
    containerRef.current.style.transformOrigin = 'top left'
  }, [])

  const fitToView = useCallback((attempt = 0) => {
    if (resetTimeoutRef.current !== null) window.clearTimeout(resetTimeoutRef.current)
    if (resetRafRef.current !== null) window.cancelAnimationFrame(resetRafRef.current)
    resetTimeoutRef.current = window.setTimeout(() => {
      resetRafRef.current = window.requestAnimationFrame(() => {
        const wrapperEl = wrapperRef.current
        const containerEl = containerRef.current
        if (!wrapperEl || !containerEl) return
        const svgNode = containerEl.querySelector('svg')
        if (!svgNode) { if (attempt < 6) fitToView(attempt + 1); return }
        const svgWidth = (svgNode as unknown as HTMLElement).offsetWidth
        const svgHeight = (svgNode as unknown as HTMLElement).offsetHeight
        const containerWidth = wrapperEl.offsetWidth
        const containerHeight = wrapperEl.offsetHeight
        if (svgWidth <= 0 || svgHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
          if (attempt < 6) fitToView(attempt + 1); return
        }
        const fitScale = Math.min(containerWidth / svgWidth, containerHeight / svgHeight, 1)
        const translateX = (containerWidth - svgWidth * fitScale) / 2
        const translateY = (containerHeight - svgHeight * fitScale) / 2
        scaleRef.current = fitScale
        panOffset.current = { x: translateX, y: translateY }
        setScale(fitScale)
        applyTransform(fitScale)
      })
    }, attempt === 0 ? 100 : 50)
  }, [applyTransform])

  const resetView = useCallback(() => {
    hasUserInteracted.current = false
    fitToView(0)
  }, [fitToView])

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current !== null) window.clearTimeout(resetTimeoutRef.current)
      if (resetRafRef.current !== null) window.cancelAnimationFrame(resetRafRef.current)
    }
  }, [])

  const renderDiagram = useCallback(async (code: string) => {
    if (!code?.trim()) return
    try {
      const mermaid = (await import('mermaid')).default
      mermaid.initialize(getMermaidConfig())
      const freshId = `${renderIdRef.current}-${Date.now()}`
      try {
        const { svg: rendered } = await mermaid.render(freshId, code)
        setSvg(fixSvgString(rendered))
        setError('')
      } catch (err) {
        setSvg('')
        setError(err instanceof Error ? err.message : String(err))
      }
    } catch (err) {
      setSvg('')
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => { renderDiagram(dsl) }, [dsl, renderDiagram])

  // After SVG is in the DOM — fix colors including foreignObject HTML
  useEffect(() => {
    if (!svg || !containerRef.current) return
    // Use rAF to ensure dangerouslySetInnerHTML has fully committed to DOM
    const raf = requestAnimationFrame(() => {
      const svgEl = containerRef.current?.querySelector('svg')
      if (svgEl) fixSvgColors(svgEl as SVGElement)
      if (!hasUserInteracted.current) {
        panOffset.current = { x: 0, y: 0 }
        scaleRef.current = 1
        setScale(1)
        applyTransform(1)
        fitToView(0)
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [svg, fitToView, applyTransform])

  useEffect(() => { fitToView(0) }, [fitToView])

  useEffect(() => {
    const observer = new MutationObserver(() => {
      hasUserInteracted.current = false
      renderDiagram(dsl)
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [dsl, renderDiagram])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return
      e.preventDefault(); e.stopPropagation()
      hasUserInteracted.current = true
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      isPanning.current = true
      panStart.current = { x: e.clientX - panOffset.current.x, y: e.clientY - panOffset.current.y }
      
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!isPanning.current) return
      e.preventDefault()
      panOffset.current = { x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y }
      applyTransform(scaleRef.current)
    }
    const onPointerUp = (e: PointerEvent) => {
      if (!isPanning.current) return
      isPanning.current = false
      ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
    }
    wrapper.addEventListener('pointerdown', onPointerDown)
    wrapper.addEventListener('pointermove', onPointerMove)
    wrapper.addEventListener('pointerup', onPointerUp)
    wrapper.addEventListener('pointercancel', onPointerUp)
    return () => {
      wrapper.removeEventListener('pointerdown', onPointerDown)
      wrapper.removeEventListener('pointermove', onPointerMove)
      wrapper.removeEventListener('pointerup', onPointerUp)
      wrapper.removeEventListener('pointercancel', onPointerUp)
    }
  }, [applyTransform])

  const zoomIn = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation(); e?.preventDefault()
    hasUserInteracted.current = true
    const next = Math.min(3, scaleRef.current + 0.2)
    scaleRef.current = next; setScale(() => next); applyTransform(next)
  }, [applyTransform])

  const zoomOut = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation(); e?.preventDefault()
    hasUserInteracted.current = true
    const next = Math.max(0.3, scaleRef.current - 0.2)
    scaleRef.current = next; setScale(() => next); applyTransform(next)
  }, [applyTransform])

  const copyDsl = useCallback(() => navigator.clipboard.writeText(dsl), [dsl])
  const openEditModal = useCallback(() => {
    window.dispatchEvent(new CustomEvent('helix:diagram:edit', { detail: { id: nodeId, dsl } }))
  }, [dsl, nodeId])

  return (
    <NodeViewWrapper>
      <div className="mermaid-block" data-diagram-id={nodeId}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        style={{ position: 'relative' }}>
        {selected && (
          <div style={{ position: 'absolute', top: -34, left: 0, background: 'var(--surface-hover)', border: '1px solid var(--accent)', borderRadius: 4, display: 'flex', gap: 4, padding: 3, zIndex: 3 }}>
            <button onClick={openEditModal} style={toolbarBtnStyle}>Edit</button>
            <button onClick={copyDsl} style={toolbarBtnStyle}>Copy DSL</button>
            <button onClick={() => deleteNode()} style={{ ...toolbarBtnStyle, color: '#f87171', borderColor: '#f87171' }}>Delete</button>
          </div>
        )}
        <div className="mermaid-block__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>◈ diagram</span>
          {(hovered || selected) && (
            <button onClick={openEditModal} style={{ background: 'none', border: '1px solid var(--accent)', borderRadius: 4, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, padding: '2px 8px' }}>Edit</button>
          )}
        </div>
        <div className="mermaid-block__content" style={{ background: 'var(--surface)', overflow: 'hidden', minHeight: 220, position: 'relative' }}>
          {error ? (
            <div style={{ color: '#f87171', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', padding: '1rem' }}>⚠ {error}</div>
          ) : svg ? (
            <>
              <div ref={wrapperRef} style={{ width: '100%', minHeight: 220, overflow: 'hidden', cursor: 'grab', userSelect: 'none', touchAction: 'none' }}>
                <div ref={containerRef} dangerouslySetInnerHTML={{ __html: svg }}
                  style={{ display: 'inline-block', minWidth: 800, padding: '1rem', transformOrigin: 'top left', willChange: 'transform' }} />
              </div>
              <button onClick={resetView} title="Reset view" style={{ position: 'absolute', bottom: 8, right: 8, background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 14, padding: '3px 8px', zIndex: 5, lineHeight: 1 }}>↺</button>
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', padding: '1rem' }}>Rendering diagram…</div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}

const toolbarBtnStyle: React.CSSProperties = { background: 'none', border: '1px solid var(--accent)', borderRadius: 3, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, padding: '2px 7px' }
const zoomBtnStyle: React.CSSProperties = { background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 14, padding: '0 4px', lineHeight: 1 }

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
  parseHTML() { return [{ tag: 'div[data-diagram-id]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-diagram-id': HTMLAttributes.id, 'data-dsl': HTMLAttributes.dsl }]
  },
  addNodeView() { return ReactNodeViewRenderer(DiagramNodeView) },
})