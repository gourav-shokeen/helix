'use client'
// components/graph/KnowledgeGraph.tsx — D3 force-directed knowledge graph
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Document } from '@/types'

type D3Module = typeof import('d3')

// Extend SimulationNodeDatum without depending on dynamic import at type-check time
interface GraphNodeDatum {
  id: string
  title: string
  type: 'doc'
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
  index?: number
}

interface GraphLinkDatum {
  source: string | GraphNodeDatum
  target: string | GraphNodeDatum
}

export interface EdgeData {
  source: string
  target: string
  type: string
}

interface SidePanelData {
  id: string
  title: string
  excerpt: string
  connected: Array<{ id: string; title: string }>
}

interface KnowledgeGraphProps {
  docs: Document[]
  edges: EdgeData[]
  excerpts: Record<string, string>
  searchQuery: string
  onSearchChange: (q: string) => void
  connectedOnly: boolean
  onConnectedOnlyChange: (v: boolean) => void
  onNodeClick: (id: string) => void
}

export function KnowledgeGraph({
  docs,
  edges,
  excerpts,
  searchQuery,
  onSearchChange,
  connectedOnly,
  onConnectedOnlyChange,
  onNodeClick,
}: KnowledgeGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const simulationRef = useRef<ReturnType<D3Module['forceSimulation']> | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeSelRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const labelSelRef = useRef<any>(null)
  const selectedIdRef = useRef<string | null>(null)
  const excerptsRef = useRef(excerpts)
  excerptsRef.current = excerpts

  const [panel, setPanel] = useState<SidePanelData | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)

  const closePanel = useCallback(() => {
    selectedIdRef.current = null
    setPanel(null)
    nodeSelRef.current?.attr('stroke', '#333').attr('fill', '#1a1a2e')
  }, [])

  const buildGraph = useCallback(async () => {
    if (!svgRef.current) return
    const d3: D3Module = await import('d3')

    selectedIdRef.current = null
    setPanel(null)

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth || 900
    const height = svgRef.current.clientHeight || 650

    // Determine visible nodes
    const connectedIds = new Set<string>()
    edges.forEach((e) => { connectedIds.add(e.source); connectedIds.add(e.target) })
    const visibleDocs = connectedOnly ? docs.filter((d) => connectedIds.has(d.id)) : docs

    if (visibleDocs.length === 0) return

    const nodes: GraphNodeDatum[] = visibleDocs.map((d) => ({
      id: d.id,
      title: d.title || 'Untitled',
      type: 'doc',
    }))
    const nodeIds = new Set(nodes.map((n) => n.id))

    const links: GraphLinkDatum[] = edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }))

    // Connection count per node
    const connCount = new Map<string, number>()
    nodes.forEach((n) => connCount.set(n.id, 0))
    links.forEach((l) => {
      const s = typeof l.source === 'string' ? l.source : (l.source as GraphNodeDatum).id
      const t = typeof l.target === 'string' ? l.target : (l.target as GraphNodeDatum).id
      connCount.set(s, (connCount.get(s) ?? 0) + 1)
      connCount.set(t, (connCount.get(t) ?? 0) + 1)
    })

    // Zoom/pan
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on('zoom', (event) => g.attr('transform', event.transform))
    svg.call(zoom)

    const g = svg.append('g')

    // Arrowhead marker
    svg.append('defs').append('marker')
      .attr('id', 'kg-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 26)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#2a2a3e')

    // Force simulation
    const simulation = d3
      .forceSimulation<GraphNodeDatum>(nodes)
      .force('link', d3.forceLink<GraphNodeDatum, GraphLinkDatum>(links).id((d) => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(44))

    simulationRef.current = simulation as unknown as ReturnType<D3Module['forceSimulation']>

    // Links
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#2a2a3e')
      .attr('stroke-width', 1)
      .attr('marker-end', 'url(#kg-arrow)')

    // Nodes
    const node = g.append('g')
      .selectAll<SVGCircleElement, GraphNodeDatum>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', 20)
      .attr('fill', '#1a1a2e')
      .attr('stroke', '#333')
      .attr('stroke-width', 2)
      .attr('cursor', 'pointer')
      .on('click', (_event, d) => {
        const connected = links
          .map((l) => {
            const s = typeof l.source === 'string' ? l.source : (l.source as GraphNodeDatum).id
            const t = typeof l.target === 'string' ? l.target : (l.target as GraphNodeDatum).id
            if (s === d.id) return nodes.find((n) => n.id === t)
            if (t === d.id) return nodes.find((n) => n.id === s)
            return null
          })
          .filter((n): n is GraphNodeDatum => n != null)
          .map((n) => ({ id: n.id, title: n.title }))

        selectedIdRef.current = d.id
        setPanel({
          id: d.id,
          title: d.title,
          excerpt: excerptsRef.current[d.id] ?? '',
          connected,
        })
        node.attr('stroke', (n) => n.id === d.id ? '#00d4a1' : '#333')
      })
      .on('mouseover', function (_event, d) {
        if (selectedIdRef.current !== d.id) {
          d3.select(this).attr('stroke', '#00d4a1').attr('fill', '#1a1a3a')
        }
        const count = connCount.get(d.id) ?? 0
        setTooltip({
          x: _event.clientX,
          y: _event.clientY,
          text: `${d.title} · ${count} connection${count === 1 ? '' : 's'}`,
        })
      })
      .on('mousemove', (_event) => {
        setTooltip((prev) => prev ? { ...prev, x: _event.clientX, y: _event.clientY } : null)
      })
      .on('mouseout', function (_event, d) {
        if (selectedIdRef.current !== d.id) {
          d3.select(this).attr('stroke', '#333').attr('fill', '#1a1a2e')
        }
        setTooltip(null)
      })

    nodeSelRef.current = node

    // Labels
    const label = g.append('g')
      .selectAll<SVGTextElement, GraphNodeDatum>('text')
      .data(nodes)
      .join('text')
      .text((d) => d.title.length > 20 ? `${d.title.slice(0, 20)}…` : d.title)
      .attr('font-size', 10)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('fill', '#888')
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none')
      .attr('dy', 36)

    labelSelRef.current = label

    // Drag
    const drag = d3
      .drag<SVGCircleElement, GraphNodeDatum>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x; d.fy = d.y
      })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null; d.fy = null
      })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(node as any).call(drag)

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as GraphNodeDatum).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNodeDatum).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNodeDatum).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNodeDatum).y ?? 0)
      node.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0)
      label.attr('x', (d) => d.x ?? 0).attr('y', (d) => d.y ?? 0)
    })

    // Apply initial search filter
    const q0 = searchQuery.trim().toLowerCase()
    if (q0) {
      node.style('opacity', (d) => d.title.toLowerCase().includes(q0) ? 1 : 0.1)
      label.style('opacity', (d) => d.title.toLowerCase().includes(q0) ? 1 : 0.1)
    }
  }, [docs, edges, connectedOnly]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { buildGraph() }, [buildGraph])

  // Search filter — update opacity without rebuilding graph
  useEffect(() => {
    if (!nodeSelRef.current || !labelSelRef.current) return
    const q = searchQuery.trim().toLowerCase()
    nodeSelRef.current.style('opacity', (d: GraphNodeDatum) =>
      !q || d.title.toLowerCase().includes(q) ? 1 : 0.1,
    )
    labelSelRef.current.style('opacity', (d: GraphNodeDatum) =>
      !q || d.title.toLowerCase().includes(q) ? 1 : 0.1,
    )
  }, [searchQuery])

  const handleReset = useCallback(() => {
    simulationRef.current?.alpha(1).restart()
  }, [])

  const showEmptyState = docs.length === 0 || (connectedOnly && edges.length === 0)
  const showHint = docs.length > 0 && edges.length === 0 && !connectedOnly

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#080810',
        backgroundImage: 'radial-gradient(circle, #1a1a2e 1px, transparent 1px)',
        backgroundSize: '30px 30px',
      }}
    >
      {/* Controls — top-left overlay */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 14,
          zIndex: 10,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search docs…"
          style={{
            background: '#0d0d1a',
            border: '1px solid #2a2a3e',
            borderRadius: 6,
            padding: '6px 12px',
            color: '#e0e0e0',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 12,
            outline: 'none',
            width: 180,
          }}
        />
        <button
          onClick={handleReset}
          style={{
            background: '#0d0d1a',
            border: '1px solid #2a2a3e',
            borderRadius: 6,
            padding: '6px 12px',
            color: '#aaa',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Reset layout
        </button>
        <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #2a2a3e' }}>
          <button
            onClick={() => onConnectedOnlyChange(false)}
            style={{
              padding: '6px 12px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              cursor: 'pointer',
              border: 'none',
              background: !connectedOnly ? '#00d4a1' : '#0d0d1a',
              color: !connectedOnly ? '#000' : '#aaa',
            }}
          >
            All docs
          </button>
          <button
            onClick={() => onConnectedOnlyChange(true)}
            style={{
              padding: '6px 12px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              cursor: 'pointer',
              border: 'none',
              background: connectedOnly ? '#00d4a1' : '#0d0d1a',
              color: connectedOnly ? '#000' : '#aaa',
            }}
          >
            Connected only
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />

      {/* Empty state */}
      {showEmptyState && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ textAlign: 'center', color: '#444', fontFamily: 'JetBrains Mono, monospace' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⬡</div>
            <div style={{ fontSize: 14, color: '#666' }}>No linked docs yet.</div>
            <div style={{ marginTop: 6, fontSize: 12, color: '#444' }}>
              Use{' '}
              <code style={{ color: '#00d4a1', background: '#0d0d1a', padding: '2px 6px', borderRadius: 4 }}>
                [[doc title]]
              </code>{' '}
              in any document to create connections.
            </div>
          </div>
        </div>
      )}

      {/* Hint bar when no edges but docs exist */}
      {showHint && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#0d0d1a',
            border: '1px solid #2a2a3e',
            borderRadius: 8,
            padding: '8px 16px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            color: '#555',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Tip: use <span style={{ color: '#00d4a1' }}>[[doc title]]</span> in documents to draw connections
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 14,
            top: tooltip.y - 12,
            background: '#0d0d1a',
            border: '1px solid #2a2a3e',
            padding: '6px 10px',
            borderRadius: 4,
            pointerEvents: 'none',
            zIndex: 20,
            fontSize: 12,
            color: '#e0e0e0',
            fontFamily: 'JetBrains Mono, monospace',
            maxWidth: 280,
            whiteSpace: 'nowrap',
          }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Side panel */}
      {panel && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 320,
            background: '#0d0d1a',
            borderLeft: '1px solid #2a2a3e',
            padding: '20px 18px',
            zIndex: 15,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <h3
              style={{
                margin: 0,
                color: '#e0e0e0',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 14,
                fontWeight: 600,
                lineHeight: 1.4,
              }}
            >
              {panel.title}
            </h3>
            <button
              onClick={closePanel}
              style={{
                background: 'none',
                border: 'none',
                color: '#555',
                cursor: 'pointer',
                fontSize: 20,
                lineHeight: 1,
                padding: 0,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>

          {panel.excerpt && (
            <p
              style={{
                margin: 0,
                color: '#777',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11,
                lineHeight: 1.7,
              }}
            >
              {panel.excerpt}
              {panel.excerpt.length >= 200 ? '…' : ''}
            </p>
          )}

          <button
            onClick={() => onNodeClick(panel.id)}
            style={{
              background: '#00d4a1',
              color: '#000',
              border: 'none',
              borderRadius: 6,
              padding: '9px 16px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.03em',
            }}
          >
            Open doc →
          </button>

          {panel.connected.length > 0 && (
            <div>
              <div
                style={{
                  color: '#444',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10,
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Connected docs ({panel.connected.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {panel.connected.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onNodeClick(c.id)}
                    style={{
                      background: '#141426',
                      border: '1px solid #2a2a3e',
                      borderRadius: 4,
                      padding: '7px 10px',
                      color: '#00d4a1',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 11,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
