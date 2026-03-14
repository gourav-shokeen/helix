'use client'
import { Node, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'

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

  const applyTransform = useCallback((s: number) => {
    if (!containerRef.current) return
    containerRef.current.style.transform = `translate(${panOffset.current.x}px, ${panOffset.current.y}px) scale(${s})`
    containerRef.current.style.transformOrigin = 'top left'
  }, [])

  const renderDiagram = useCallback(async (code: string) => {
    if (!code?.trim()) return
    try {
      const mermaid = (await import('mermaid')).default
      const isLight = document.documentElement.dataset.theme === 'light'

      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        fontFamily: 'JetBrains Mono, monospace',
        logLevel: 'fatal',
        securityLevel: 'loose',
        gantt: {
          useWidth: 900,
          barHeight: 28,
          barGap: 8,
          topPadding: 50,
          fontSize: 13,
        },
        themeVariables: isLight ? {
          primaryColor: '#e5e5e0',
          primaryTextColor: '#1a1a1a',
          primaryBorderColor: '#d0d0cc',
          lineColor: '#505060',
          secondaryColor: '#ededea',
          tertiaryColor: '#f5f5f0',
          background: '#f5f5f0',
          mainBkg: '#ededea',
          nodeBorder: '#d0d0cc',
          clusterBkg: '#e5e5e0',
          titleColor: '#1a1a1a',
          edgeLabelBackground: '#f5f5f0',
          sectionBkgColor: '#e5e5e0',
          sectionBkgColor2: '#ededea',
          altSectionBkgColor: '#ddddd8',
          gridColor: '#d0d0cc',
          taskBkgColor: '#00a67d',
          taskTextColor: '#ffffff',
          taskTextLightColor: '#1a1a1a',
          taskTextOutsideColor: '#1a1a1a',
          taskBorderColor: '#00a67d',
          activeTaskBkgColor: '#00856a',
          activeTaskBorderColor: '#00856a',
          doneTaskBkgColor: '#c0c0bc',
          doneTaskBorderColor: '#b0b0ac',
          critBkgColor: '#d04040',
          critBorderColor: '#d04040',
          critTextColor: '#ffffff',
          todayLineColor: '#c09000',
          fontFamily: 'JetBrains Mono, monospace',
        } : {
          primaryColor: '#1c1c20',
          primaryTextColor: '#e8e8ec',
          primaryBorderColor: '#2e2e34',
          lineColor: '#9090a8',
          secondaryColor: '#141416',
          tertiaryColor: '#242428',
          background: '#0e0e0f',
          mainBkg: '#1c1c20',
          nodeBorder: '#2e2e34',
          clusterBkg: '#141416',
          titleColor: '#e8e8ec',
          edgeLabelBackground: '#141416',
          sectionBkgColor: '#1c1c20',
          sectionBkgColor2: '#141416',
          altSectionBkgColor: '#242428',
          gridColor: '#2e2e34',
          taskBkgColor: '#00d4a1',
          taskTextColor: '#001a13',
          taskTextLightColor: '#e8e8ec',
          taskTextOutsideColor: '#e8e8ec',
          taskBorderColor: '#00d4a1',
          activeTaskBkgColor: '#00a67d',
          activeTaskBorderColor: '#00a67d',
          doneTaskBkgColor: '#242428',
          doneTaskBorderColor: '#2e2e34',
          critBkgColor: '#f87171',
          critBorderColor: '#f87171',
          critTextColor: '#ffffff',
          todayLineColor: '#fbbf24',
          fontFamily: 'JetBrains Mono, monospace',
        },
      })

      const freshId = `${renderIdRef.current}-${Date.now()}`
      try {
        const { svg: rendered } = await mermaid.render(freshId, code)
        setSvg(rendered)
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

  useEffect(() => {
    renderDiagram(dsl)
  }, [dsl, renderDiagram])

  // Inject a <style> block into the SVG after render to override mermaid's
  // internal CSS (which uses specificity that beats el.style.fill assignments)
  useEffect(() => {
    if (!svg || !containerRef.current) return
    const svgEl = containerRef.current.querySelector('svg')
    if (!svgEl) return

    const isLight = document.documentElement.dataset.theme === 'light'
    const textColor    = isLight ? '#1a1a1a' : '#e8e8ec'
    const mutedColor   = isLight ? '#505060' : '#9090a8'
    const taskText     = isLight ? '#ffffff'  : '#001a13'
    const outsideText  = isLight ? '#1a1a1a'  : '#e8e8ec'

    // Fix SVG sizing
    svgEl.removeAttribute('width')
    svgEl.removeAttribute('height')
    svgEl.style.width = '100%'
    svgEl.style.minWidth = '800px'
    svgEl.style.height = 'auto'
    svgEl.style.display = 'block'

    // Remove any existing helix override style to avoid duplicates on re-render
    svgEl.querySelector('style[data-helix]')?.remove()

    // Inject override styles — !important beats mermaid's internal <style> block
    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    styleEl.setAttribute('data-helix', 'true')
    styleEl.textContent = `
      text, tspan { fill: ${textColor} !important; }
      .titleText  { fill: ${textColor} !important; font-weight: 600 !important; }
      .sectionTitle, .sectionLabel { fill: ${mutedColor} !important; }
      .tick text, .axis text { fill: ${mutedColor} !important; }
      .taskText   { fill: ${taskText}    !important; font-size: 12px !important; }
      .taskTextOutsideRight,
      .taskTextOutsideLeft  { fill: ${outsideText}  !important; font-size: 12px !important; }
    `
    // Prepend so mermaid's own styles still apply for non-overridden properties
    svgEl.insertBefore(styleEl, svgEl.firstChild)
  }, [svg])

  // Pointer capture pan — bypasses Tiptap ProseMirror event handling
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return
      e.preventDefault()
      e.stopPropagation()
      wrapper.setPointerCapture(e.pointerId)
      isPanning.current = true
      panStart.current = {
        x: e.clientX - panOffset.current.x,
        y: e.clientY - panOffset.current.y,
      }
      wrapper.style.cursor = 'grabbing'
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!isPanning.current) return
      e.preventDefault()
      panOffset.current = {
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y,
      }
      applyTransform(scaleRef.current)
    }
    const onPointerUp = (e: PointerEvent) => {
      if (!isPanning.current) return
      isPanning.current = false
      wrapper.releasePointerCapture(e.pointerId)
      wrapper.style.cursor = 'grab'
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

  const zoomIn = useCallback(() => {
    const next = Math.min(3, scaleRef.current + 0.2)
    scaleRef.current = next
    setScale(next)
    applyTransform(next)
  }, [applyTransform])

  const zoomOut = useCallback(() => {
    const next = Math.max(0.3, scaleRef.current - 0.2)
    scaleRef.current = next
    setScale(next)
    applyTransform(next)
  }, [applyTransform])

  const resetView = useCallback(() => {
    scaleRef.current = 1
    panOffset.current = { x: 0, y: 0 }
    setScale(1)
    applyTransform(1)
  }, [applyTransform])

  const copyDsl = useCallback(() => navigator.clipboard.writeText(dsl), [dsl])

  const openEditModal = useCallback(() => {
    window.dispatchEvent(new CustomEvent('helix:diagram:edit', { detail: { id: nodeId, dsl } }))
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
        {/* Select toolbar */}
        {selected && (
          <div style={{ position: 'absolute', top: -34, left: 0, background: 'var(--surface-hover)', border: '1px solid var(--accent)', borderRadius: 4, display: 'flex', gap: 4, padding: 3, zIndex: 3 }}>
            <button onClick={openEditModal} style={toolbarBtnStyle}>Edit</button>
            <button onClick={copyDsl} style={toolbarBtnStyle}>Copy DSL</button>
            <button onClick={() => deleteNode()} style={{ ...toolbarBtnStyle, color: '#f87171', borderColor: '#f87171' }}>Delete</button>
          </div>
        )}

        {/* Header */}
        <div className="mermaid-block__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>◈ diagram</span>
          {(hovered || selected) && (
            <button
              onClick={openEditModal}
              style={{ background: 'none', border: '1px solid var(--accent)', borderRadius: 4, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, padding: '2px 8px' }}
            >
              Edit
            </button>
          )}
        </div>

        {/* Content */}
        <div
          className="mermaid-block__content"
          style={{ background: 'var(--surface)', overflow: 'hidden', minHeight: 220, position: 'relative' }}
        >
          {error ? (
            <div style={{ color: '#f87171', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', padding: '1rem' }}>⚠ {error}</div>
          ) : svg ? (
            <>
              <div
                ref={wrapperRef}
                style={{ width: '100%', minHeight: 220, overflow: 'hidden', cursor: 'grab', userSelect: 'none', touchAction: 'none' }}
              >
                <div
                  ref={containerRef}
                  dangerouslySetInnerHTML={{ __html: svg }}
                  style={{ display: 'inline-block', minWidth: 800, padding: '1rem', transformOrigin: 'top left', willChange: 'transform' }}
                />
              </div>

              {/* Zoom controls */}
              <div style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', alignItems: 'center', gap: 2, zIndex: 5, background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: 5, padding: '3px 6px' }}>
                <button onClick={zoomOut} style={zoomBtnStyle}>−</button>
                <span style={{ color: 'var(--text-muted)', fontSize: 10, minWidth: 34, textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>
                  {Math.round(scale * 100)}%
                </span>
                <button onClick={zoomIn} style={zoomBtnStyle}>+</button>
                <span style={{ color: 'var(--border)', margin: '0 2px' }}>|</span>
                <button onClick={resetView} style={{ ...zoomBtnStyle, fontSize: 12 }}>↺</button>
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', padding: '1rem' }}>
              Rendering diagram…
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}

const toolbarBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--accent)',
  borderRadius: 3,
  color: 'var(--accent)',
  cursor: 'pointer',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 10,
  padding: '2px 7px',
}

const zoomBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 14,
  padding: '0 4px',
  lineHeight: 1,
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
    return ['div', { 'data-diagram-id': HTMLAttributes.id, 'data-dsl': HTMLAttributes.dsl }]
  },

  addNodeView() {
    return ReactNodeViewRenderer(DiagramNodeView)
  },
})