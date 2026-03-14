'use client'
import { Node, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getMermaidConfig, fixSvgColors, fixSvgString } from '@/lib/mermaidTheme'
import React from 'react'

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

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e?.stopPropagation(); e?.preventDefault()
    hasUserInteracted.current = true
    const delta = e.deltaY < 0 ? 0.2 : -0.2
    const newScale = Math.max(0.1, Math.min(5, scaleRef.current - delta))
    setScale(newScale)
    scaleRef.current = newScale
    applyTransform(newScale)
  }, [applyTransform])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    hasUserInteracted.current = true
    isPanning.current = true
    panStart.current = { x: e.clientX, y: e.clientY }
    wrapperRef.current?.classList.add('is-panning')
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return
    const dx = e.clientX - panStart.current.x
    const dy = e.clientY - panStart.current.y
    panOffset.current.x += dx
    panOffset.current.y += dy
    panStart.current = { x: e.clientX, y: e.clientY }
    applyTransform(scaleRef.current)
  }, [applyTransform])

  const handleMouseUp = useCallback(() => {
    isPanning.current = false
    wrapperRef.current?.classList.remove('is-panning')
  }, [])

  const handleDoubleClick = useCallback(() => {
    window.dispatchEvent(new CustomEvent('helix:diagram:edit', { detail: { id: nodeId, dsl } }))
  }, [nodeId, dsl])

  return (
    <NodeViewWrapper>
      <div className="mermaid-block" data-diagram-id={nodeId}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); handleMouseUp() }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        className={selected ? 'is-selected' : ''}
        style={{
          border: '1px solid var(--border)',
          borderRadius: '8px',
          overflow: 'hidden',
          position: 'relative',
          background: 'var(--surface)',
          height: '400px',
          userSelect: 'none',
        }}
      >
        <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
          {error ? (
            <div style={{ padding: '1rem', color: 'var(--red)', fontSize: '12px', whiteSpace: 'pre-wrap' }}>{error}</div>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: svg }} style={{ cursor: 'grab' }} />
          )}
        </div>
        {(hovered || selected) && (
          <>
            <button
              onClick={deleteNode}
              contentEditable={false}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                width: '24px',
                height: '24px',
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: '50%',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                lineHeight: 1,
                zIndex: 10,
              }}
            >
              &times;
            </button>
            <button
              onClick={resetView}
              contentEditable={false}
              style={{
                position: 'absolute',
                bottom: '8px',
                right: '8px',
                padding: '4px 8px',
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '10px',
                zIndex: 10,
              }}
            >
              Reset View
            </button>
          </>
        )}
      </div>
    </NodeViewWrapper>
  )
}

const MemoizedDiagramNodeView = React.memo(DiagramNodeView)

export const DiagramNodeExtension = Node.create({
  name: 'diagram',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      id: { default: null },
      dsl: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-diagram-id]' }, { tag: 'div[data-type="diagram"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-type': 'diagram', ...HTMLAttributes }]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MemoizedDiagramNodeView)
  },
})