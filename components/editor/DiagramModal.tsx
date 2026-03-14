'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getMermaidConfig, fixSvgColors, fixSvgString } from '@/lib/mermaidTheme'

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

interface FlowNode { id: string; label: string; shape: 'rect' | 'round' | 'diamond' }
interface FlowEdge { id: string; from: string; to: string; label: string; style: '-->' | '---' | '-.->'}
interface SeqParticipant { id: string; alias: string; label: string }
interface SeqMessage { id: string; from: string; to: string; text: string; style: '->>' | '-->>'}
interface GanttTask { id: string; label: string; alias: string; startType: 'date' | 'after'; startDate: string; afterAlias: string; duration: string; section: string }
interface ErField { id: string; type: string; name: string; key: 'PK' | 'FK' | '' }
interface ErEntity { id: string; name: string; fields: ErField[] }
interface ErRelation { id: string; from: string; to: string; rel: string; label: string }

function buildFlowchart(nodes: FlowNode[], edges: FlowEdge[]): string {
  const shapeOpen  = (s: FlowNode['shape']) => s === 'rect' ? '[' : s === 'round' ? '(' : '{'
  const shapeClose = (s: FlowNode['shape']) => s === 'rect' ? ']' : s === 'round' ? ')' : '}'
  const lines = ['graph TD']
  nodes.forEach(n => lines.push(`  ${n.id}${shapeOpen(n.shape)}${n.label}${shapeClose(n.shape)}`))
  edges.forEach(e => { const lbl = e.label ? `|${e.label}|` : ''; lines.push(`  ${e.from} ${e.style}${lbl} ${e.to}`) })
  return lines.join('\n')
}
function buildSequence(participants: SeqParticipant[], messages: SeqMessage[]): string {
  const lines = ['sequenceDiagram']
  participants.forEach(p => lines.push(`  participant ${p.alias} as ${p.label}`))
  messages.forEach(m => lines.push(`  ${m.from}${m.style}${m.to}: ${m.text}`))
  return lines.join('\n')
}
function buildGantt(title: string, tasks: GanttTask[]): string {
  const lines = ['gantt', `  title ${title}`, '  dateFormat  YYYY-MM-DD']
  let lastSection = ''
  tasks.forEach(t => {
    if (t.section !== lastSection) { lines.push(`  section ${t.section}`); lastSection = t.section }
    const start = t.startType === 'after' ? `after ${t.afterAlias}` : t.startDate
    lines.push(`  ${t.label}${t.alias ? ` :${t.alias},` : ' :'} ${start}, ${t.duration}`)
  })
  return lines.join('\n')
}
function buildEr(entities: ErEntity[], relations: ErRelation[]): string {
  const lines = ['erDiagram']
  entities.forEach(e => {
    lines.push(`  ${e.name} {`)
    e.fields.forEach(f => lines.push(`    ${f.type} ${f.name}${f.key ? ' ' + f.key : ''}`))
    lines.push('  }')
  })
  relations.forEach(r => lines.push(`  ${r.from} ${r.rel} ${r.to} : "${r.label}"`))
  return lines.join('\n')
}
function parseGantt(dsl: string): { title: string; tasks: GanttTask[] } {
  const lines = dsl.split('\n'); let title = ''; let currentSection = 'Phase 1'; const tasks: GanttTask[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (line.startsWith('title ')) title = line.slice(6).trim()
    if (line.startsWith('section ')) currentSection = line.slice(8).trim()
    const m = line.match(/^(.+?)\s*:([^,]*),\s*(.+?),\s*(.+)$/)
    if (m) {
      const [, label, aliasPart, startPart, duration] = m
      const isAfter = startPart.trim().startsWith('after ')
      tasks.push({ id: crypto.randomUUID(), label: label.trim(), alias: aliasPart.trim(), startType: isAfter ? 'after' : 'date', startDate: isAfter ? '' : startPart.trim(), afterAlias: isAfter ? startPart.trim().replace('after ', '') : '', duration: duration.trim(), section: currentSection })
    }
  }
  return { title, tasks }
}

const inp: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, outline: 'none', padding: '0.3rem 0.5rem', flex: 1, minWidth: 0 }
const addBtn: React.CSSProperties = { background: 'none', border: '1px dashed var(--accent)', borderRadius: 5, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, padding: '0.3rem', marginTop: 4, width: '100%' }
const delBtn: React.CSSProperties = {
  position: 'absolute',
  top: 6,
  right: 6,
  width: 18,
  height: 18,
  background: 'var(--surface)',
  border: '1px solid var(--red)',
  borderRadius: 4,
  color: 'var(--red)',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 700,
  fontFamily: 'JetBrains Mono, monospace',
  padding: 0,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2,
}
const rowBox: React.CSSProperties = { position: 'relative', background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.55rem 2rem 0.55rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 5 }
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 }
const lbl = (text: string) => <span style={{ color: 'var(--text-muted)', fontSize: 10, minWidth: 56, flexShrink: 0 }}>{text}</span>

function FlowEditor({ nodes, edges, onChange }: { nodes: FlowNode[]; edges: FlowEdge[]; onChange: (n: FlowNode[], e: FlowEdge[]) => void }) {
  const patchNode = (i: number, p: Partial<FlowNode>) => { const n = nodes.map((x, j) => j === i ? { ...x, ...p } : x); onChange(n, edges) }
  const patchEdge = (i: number, p: Partial<FlowEdge>) => { const e = edges.map((x, j) => j === i ? { ...x, ...p } : x); onChange(nodes, e) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Nodes</div>
      {nodes.map((n, i) => (
        <div key={n.id} style={rowBox}>
          <div style={row}>
            {lbl('ID')}<input value={n.id} onChange={e => patchNode(i, { id: e.target.value })} style={{ ...inp, width: 70 }} />
            {lbl('Label')}<input value={n.label} onChange={e => patchNode(i, { label: e.target.value })} style={inp} />
            <select value={n.shape} onChange={e => patchNode(i, { shape: e.target.value as FlowNode['shape'] })} style={{ ...inp, width: 90 }}>
              <option value="rect">Rectangle</option><option value="round">Rounded</option><option value="diamond">Diamond</option>
            </select>
          </div>
          <button onClick={() => onChange(nodes.filter((_, j) => j !== i), edges)} style={delBtn}>×</button>
        </div>
      ))}
      <button onClick={() => onChange([...nodes, { id: `N${nodes.length+1}`, label: 'New Node', shape: 'rect' }], edges)} style={addBtn}>+ Add node</button>
      <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>Edges</div>
      {edges.map((e, i) => (
        <div key={e.id} style={rowBox}>
          <div style={row}>
            {lbl('From')}<input value={e.from} onChange={v => patchEdge(i, { from: v.target.value })} style={{ ...inp, width: 70 }} />
            {lbl('To')}<input value={e.to} onChange={v => patchEdge(i, { to: v.target.value })} style={{ ...inp, width: 70 }} />
            <select value={e.style} onChange={v => patchEdge(i, { style: v.target.value as FlowEdge['style'] })} style={{ ...inp, width: 70 }}>
              <option value="-->">Arrow</option><option value="---">Line</option><option value="-.->">Dashed</option>
            </select>
          </div>
          <div style={row}>{lbl('Label')}<input value={e.label} onChange={v => patchEdge(i, { label: v.target.value })} style={inp} placeholder="optional" /></div>
          <button onClick={() => onChange(nodes, edges.filter((_, j) => j !== i))} style={delBtn}>×</button>
        </div>
      ))}
      <button onClick={() => onChange(nodes, [...edges, { id: crypto.randomUUID(), from: nodes[0]?.id||'A', to: nodes[1]?.id||'B', label: '', style: '-->' }])} style={addBtn}>+ Add edge</button>
    </div>
  )
}

function SeqEditor({ participants, messages, onChange }: { participants: SeqParticipant[]; messages: SeqMessage[]; onChange: (p: SeqParticipant[], m: SeqMessage[]) => void }) {
  const patchP = (i: number, p: Partial<SeqParticipant>) => { const n = participants.map((x, j) => j === i ? { ...x, ...p } : x); onChange(n, messages) }
  const patchM = (i: number, p: Partial<SeqMessage>) => { const n = messages.map((x, j) => j === i ? { ...x, ...p } : x); onChange(participants, n) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Participants</div>
      {participants.map((p, i) => (
        <div key={p.id} style={rowBox}>
          <div style={row}>
            {lbl('Alias')}<input value={p.alias} onChange={e => patchP(i, { alias: e.target.value })} style={{ ...inp, width: 70 }} />
            {lbl('Label')}<input value={p.label} onChange={e => patchP(i, { label: e.target.value })} style={inp} />
          </div>
          <button onClick={() => onChange(participants.filter((_, j) => j !== i), messages)} style={delBtn}>×</button>
        </div>
      ))}
      <button onClick={() => onChange([...participants, { id: crypto.randomUUID(), alias: `P${participants.length+1}`, label: 'New Person' }], messages)} style={addBtn}>+ Add participant</button>
      <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>Messages</div>
      {messages.map((m, i) => (
        <div key={m.id} style={rowBox}>
          <div style={row}>
            {lbl('From')}<input value={m.from} onChange={e => patchM(i, { from: e.target.value })} style={{ ...inp, width: 70 }} />
            {lbl('To')}<input value={m.to} onChange={e => patchM(i, { to: e.target.value })} style={{ ...inp, width: 70 }} />
            <select value={m.style} onChange={e => patchM(i, { style: e.target.value as SeqMessage['style'] })} style={{ ...inp, width: 80 }}>
              <option value="->>">Solid</option><option value="-->>">Dashed</option>
            </select>
          </div>
          <div style={row}>{lbl('Text')}<input value={m.text} onChange={e => patchM(i, { text: e.target.value })} style={inp} /></div>
          <button onClick={() => onChange(participants, messages.filter((_, j) => j !== i))} style={delBtn}>×</button>
        </div>
      ))}
      <button onClick={() => onChange(participants, [...messages, { id: crypto.randomUUID(), from: participants[0]?.alias||'A', to: participants[1]?.alias||'B', text: 'Message', style: '->>' }])} style={addBtn}>+ Add message</button>
    </div>
  )
}

function GanttEditor({ title, tasks, onTitleChange, onTaskChange, onAddTask, onRemoveTask }: { title: string; tasks: GanttTask[]; onTitleChange: (v: string) => void; onTaskChange: (i: number, p: Partial<GanttTask>) => void; onAddTask: () => void; onRemoveTask: (i: number) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={row}>{lbl('TITLE')}<input value={title} onChange={e => onTitleChange(e.target.value)} style={inp} /></div>
      {tasks.map((t, i) => (
        <div key={t.id} style={rowBox}>
          <div style={row}>
            <span style={{ color: 'var(--accent)', fontSize: 10, minWidth: 14 }}>{i+1}</span>
            <input value={t.label} onChange={e => onTaskChange(i, { label: e.target.value })} style={{ ...inp, fontWeight: 600 }} placeholder="Task name" />
            <input value={t.section} onChange={e => onTaskChange(i, { section: e.target.value })} style={{ ...inp, width: 90, fontSize: 10 }} placeholder="Section" />
          </div>
          <div style={row}>
            {lbl('START')}
            <select value={t.startType} onChange={e => onTaskChange(i, { startType: e.target.value as 'date'|'after' })} style={{ ...inp, width: 70 }}>
              <option value="date">Date</option><option value="after">After</option>
            </select>
            {t.startType === 'date'
              ? <input type="date" value={t.startDate} onChange={e => onTaskChange(i, { startDate: e.target.value })} style={inp} />
              : <input value={t.afterAlias} onChange={e => onTaskChange(i, { afterAlias: e.target.value })} style={inp} placeholder="alias e.g. a1" />}
            {lbl('DUR')}<input value={t.duration} onChange={e => onTaskChange(i, { duration: e.target.value })} style={{ ...inp, width: 55 }} placeholder="7d" />
          </div>
          <button onClick={() => onRemoveTask(i)} style={delBtn}>×</button>
        </div>
      ))}
      <button onClick={onAddTask} style={addBtn}>+ Add task</button>
    </div>
  )
}

function ErEditor({ entities, relations, onChange }: { entities: ErEntity[]; relations: ErRelation[]; onChange: (e: ErEntity[], r: ErRelation[]) => void }) {
  const patchEntity = (i: number, p: Partial<ErEntity>) => { const n = entities.map((x, j) => j === i ? { ...x, ...p } : x); onChange(n, relations) }
  const patchField = (ei: number, fi: number, p: Partial<ErField>) => { const n = entities.map((x, j) => j === ei ? { ...x, fields: x.fields.map((f, k) => k === fi ? { ...f, ...p } : f) } : x); onChange(n, relations) }
  const patchRel = (i: number, p: Partial<ErRelation>) => { const n = relations.map((x, j) => j === i ? { ...x, ...p } : x); onChange(entities, n) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Entities</div>
      {entities.map((e, ei) => (
        <div key={e.id} style={{ ...rowBox, gap: 6 }}>
          <div style={row}>
            {lbl('NAME')}<input value={e.name} onChange={v => patchEntity(ei, { name: v.target.value })} style={{ ...inp, fontWeight: 700 }} />
          </div>
          {e.fields.map((f, fi) => (
            <div key={f.id} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 8, paddingRight: '1.5rem' }}>
              <input value={f.type} onChange={v => patchField(ei, fi, { type: v.target.value })} style={{ ...inp, width: 65 }} placeholder="type" />
              <input value={f.name} onChange={v => patchField(ei, fi, { name: v.target.value })} style={inp} placeholder="field name" />
              <select value={f.key} onChange={v => patchField(ei, fi, { key: v.target.value as ErField['key'] })} style={{ ...inp, width: 55 }}>
                <option value="">—</option><option value="PK">PK</option><option value="FK">FK</option>
              </select>
              <button onClick={() => { const n = entities.map((x, j) => j === ei ? { ...x, fields: x.fields.filter((_, k) => k !== fi) } : x); onChange(n, relations) }} style={{ ...delBtn, position: 'absolute', top: '50%', right: 0, transform: 'translateY(-50%)' }}>×</button>
            </div>
          ))}
          <button onClick={() => { const n = entities.map((x, j) => j === ei ? { ...x, fields: [...x.fields, { id: crypto.randomUUID(), type: 'text', name: 'field', key: '' as const }] } : x); onChange(n, relations) }} style={{ ...addBtn, fontSize: 10, padding: '0.2rem' }}>+ field</button>
          <button onClick={() => onChange(entities.filter((_, j) => j !== ei), relations)} style={delBtn}>×</button>
        </div>
      ))}
      <button onClick={() => onChange([...entities, { id: crypto.randomUUID(), name: `ENTITY${entities.length+1}`, fields: [{ id: crypto.randomUUID(), type: 'uuid', name: 'id', key: 'PK' }] }], relations)} style={addBtn}>+ Add entity</button>
      <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>Relations</div>
      {relations.map((r, i) => (
        <div key={r.id} style={rowBox}>
          <div style={row}>
            <input value={r.from} onChange={e => patchRel(i, { from: e.target.value })} style={{ ...inp, width: 90 }} placeholder="Entity A" />
            <select value={r.rel} onChange={e => patchRel(i, { rel: e.target.value })} style={{ ...inp, width: 90 }}>
              <option value="||--o{">one-to-many</option><option value="||--||">one-to-one</option>
              <option value="}o--o{">many-to-many</option><option value="||--o|">one-to-zero-one</option>
            </select>
            <input value={r.to} onChange={e => patchRel(i, { to: e.target.value })} style={{ ...inp, width: 90 }} placeholder="Entity B" />
            <input value={r.label} onChange={e => patchRel(i, { label: e.target.value })} style={inp} placeholder="label" />
          </div>
          <button onClick={() => onChange(entities, relations.filter((_, j) => j !== i))} style={delBtn}>×</button>
        </div>
      ))}
      <button onClick={() => onChange(entities, [...relations, { id: crypto.randomUUID(), from: entities[0]?.name||'A', to: entities[1]?.name||'B', rel: '||--o{', label: 'has' }])} style={addBtn}>+ Add relation</button>
    </div>
  )
}

interface DiagramModalProps { onInsert: (syntax: string) => void; onClose: () => void; initialDsl?: string; mode?: 'insert' | 'update' }
type DiagramType = 'Flowchart' | 'Sequence' | 'Gantt' | 'ER' | 'Raw'

function detectType(dsl: string): DiagramType {
  const t = dsl.trimStart()
  if (t.startsWith('graph')) return 'Flowchart'
  if (t.startsWith('sequenceDiagram')) return 'Sequence'
  if (t.startsWith('gantt')) return 'Gantt'
  if (t.startsWith('erDiagram')) return 'ER'
  return 'Raw'
}

export function DiagramModal({ onInsert, onClose, initialDsl, mode = 'insert' }: DiagramModalProps) {
  const [syntax, setSyntax] = useState(initialDsl || TEMPLATES.Flowchart)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const [diagramType, setDiagramType] = useState<DiagramType>(() => detectType(initialDsl || TEMPLATES.Flowchart))
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>([{ id: 'A', label: 'Start', shape: 'rect' }, { id: 'B', label: 'Decision', shape: 'diamond' }, { id: 'C', label: 'Action', shape: 'rect' }, { id: 'D', label: 'End', shape: 'rect' }])
  const [flowEdges, setFlowEdges] = useState<FlowEdge[]>([{ id: '1', from: 'A', to: 'B', label: '', style: '-->' }, { id: '2', from: 'B', to: 'C', label: 'Yes', style: '-->' }, { id: '3', from: 'B', to: 'D', label: 'No', style: '-->' }])
  const [seqParticipants, setSeqParticipants] = useState<SeqParticipant[]>([{ id: '1', alias: 'A', label: 'Alice' }, { id: '2', alias: 'B', label: 'Bob' }])
  const [seqMessages, setSeqMessages] = useState<SeqMessage[]>([{ id: '1', from: 'A', to: 'B', text: 'Hello!', style: '->>' }, { id: '2', from: 'B', to: 'A', text: 'Hi there!', style: '-->>' }])
  const [ganttTitle, setGanttTitle] = useState('Project Plan')
  const [ganttTasks, setGanttTasks] = useState<GanttTask[]>([
    { id: '1', label: 'Task A', alias: 'a1', startType: 'date', startDate: '2024-01-01', afterAlias: '', duration: '7d', section: 'Phase 1' },
    { id: '2', label: 'Task B', alias: 'a2', startType: 'after', startDate: '', afterAlias: 'a1', duration: '5d', section: 'Phase 1' },
  ])
  const [erEntities, setErEntities] = useState<ErEntity[]>([
    { id: '1', name: 'USERS', fields: [{ id: '1', type: 'uuid', name: 'id', key: 'PK' }, { id: '2', type: 'text', name: 'email', key: '' }, { id: '3', type: 'text', name: 'name', key: '' }] },
    { id: '2', name: 'DOCUMENTS', fields: [{ id: '4', type: 'uuid', name: 'id', key: 'PK' }, { id: '5', type: 'text', name: 'title', key: '' }, { id: '6', type: 'uuid', name: 'owner_id', key: 'FK' }] },
  ])
  const [erRelations, setErRelations] = useState<ErRelation[]>([{ id: '1', from: 'USERS', to: 'DOCUMENTS', rel: '||--o{', label: 'owns' }])

  const idRef = useRef(`diagram-modal-${Math.random().toString(36).slice(2)}`)
  const previewRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const renderDiagram = useCallback(async (code: string) => {
    if (!code.trim()) return
    try {
      const mermaid = (await import('mermaid')).default
      mermaid.initialize(getMermaidConfig())
      const freshId = `${idRef.current}-${Date.now()}`
      const { svg: rendered } = await mermaid.render(freshId, code)
      setSvg(fixSvgString(rendered))
      setError('')
    } catch (e) {
      setError(String(e)); setSvg('')
    }
  }, [])

  useEffect(() => {
    if (!svg || !previewRef.current) return
    const raf = requestAnimationFrame(() => {
      const svgEl = previewRef.current?.querySelector('svg') as SVGElement | null
      if (!svgEl) return
      svgEl.style.display = 'block'
      if (diagramType === 'Gantt') {
        svgEl.removeAttribute('width'); svgEl.removeAttribute('height')
        svgEl.style.height = 'auto'; svgEl.style.width = '100%'; svgEl.style.minWidth = '800px'
      } else if (diagramType === 'Sequence') {
        const w = parseFloat(svgEl.getAttribute('width') || '0')
        const h = parseFloat(svgEl.getAttribute('height') || '0')
        if (w > 0 && h > 0) svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`)
        svgEl.removeAttribute('width'); svgEl.removeAttribute('height')
        svgEl.style.width = '100%'; svgEl.style.height = 'auto'
        svgEl.style.maxWidth = '100%'; svgEl.style.overflow = 'visible'
      } else {
        svgEl.removeAttribute('width'); svgEl.removeAttribute('height')
        svgEl.style.height = 'auto'; svgEl.style.width = 'auto'
        svgEl.style.maxWidth = 'none'; svgEl.style.maxHeight = '420px'
      }
      fixSvgColors(svgEl)
    })
    return () => cancelAnimationFrame(raf)
  }, [svg, diagramType])

  const updateFromVisual = useCallback((dsl: string) => {
    setSyntax(dsl)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => renderDiagram(dsl), 350)
  }, [renderDiagram])

  const initFromDsl = useCallback((dsl: string) => {
    setSvg(''); const type = detectType(dsl); setDiagramType(type); setSyntax(dsl)
    if (type === 'Gantt') { const { title, tasks } = parseGantt(dsl); setGanttTitle(title); setGanttTasks(tasks) }
    setTimeout(() => {
      renderDiagram(dsl)
      if (textareaRef.current) { textareaRef.current.scrollTop = 0; textareaRef.current.setSelectionRange(0, 0) }
    }, 100)
  }, [renderDiagram])

  useEffect(() => { initFromDsl(initialDsl || TEMPLATES.Flowchart) }, [initialDsl, initFromDsl])

  const handleTemplate = (key: string) => { setSvg(''); setError(''); initFromDsl(TEMPLATES[key]) }
  const handleDslChange = (val: string) => {
    setSyntax(val); setDiagramType(detectType(val))
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => renderDiagram(val), 400)
  }
  const handleFlowChange = (n: FlowNode[], e: FlowEdge[]) => { setFlowNodes(n); setFlowEdges(e); updateFromVisual(buildFlowchart(n, e)) }
  const handleSeqChange = (p: SeqParticipant[], m: SeqMessage[]) => { setSeqParticipants(p); setSeqMessages(m); updateFromVisual(buildSequence(p, m)) }
  const handleGanttTitleChange = (v: string) => { setGanttTitle(v); updateFromVisual(buildGantt(v, ganttTasks)) }
  const handleGanttTaskChange = (i: number, p: Partial<GanttTask>) => { const u = ganttTasks.map((t, j) => j === i ? { ...t, ...p } : t); setGanttTasks(u); updateFromVisual(buildGantt(ganttTitle, u)) }
  const handleAddGanttTask = () => { const t: GanttTask = { id: crypto.randomUUID(), label: 'New Task', alias: `t${ganttTasks.length+1}`, startType: 'date', startDate: new Date().toISOString().slice(0,10), afterAlias: '', duration: '3d', section: ganttTasks[ganttTasks.length-1]?.section||'Phase 1' }; const u = [...ganttTasks, t]; setGanttTasks(u); updateFromVisual(buildGantt(ganttTitle, u)) }
  const handleRemoveGanttTask = (i: number) => { const u = ganttTasks.filter((_, j) => j !== i); setGanttTasks(u); updateFromVisual(buildGantt(ganttTitle, u)) }
  const handleErChange = (e: ErEntity[], r: ErRelation[]) => { setErEntities(e); setErRelations(r); updateFromVisual(buildEr(e, r)) }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const hasVisualEditor = diagramType !== 'Raw'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }} onClick={onClose}>
      <div className="helix-fade-in" onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 8, width: 1200, maxWidth: '97vw', height: '84vh', maxHeight: '84vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}>◎ Diagram Builder</span>
          <div style={{ display: 'flex', gap: '0.4rem', marginLeft: 'auto' }}>
            {Object.keys(TEMPLATES).map(name => (
              <button key={name} onClick={() => handleTemplate(name)}
                style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, padding: '0.25rem 0.6rem' }}>{name}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <div style={{ flex: '0 0 42%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', minWidth: 0, position: 'relative' as const }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              {hasVisualEditor && <div style={{ fontSize: 10, color: 'var(--accent)', padding: '0.4rem 0.75rem', background: 'var(--accent-dim)', borderRight: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>✦ Visual Editor</div>}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
              {hasVisualEditor && (
                <div style={{ overflowY: 'auto', overflowX: 'hidden', flex: 1, padding: '0.75rem' }}>
                  {diagramType === 'Flowchart' && <FlowEditor nodes={flowNodes} edges={flowEdges} onChange={handleFlowChange} />}
                  {diagramType === 'Sequence' && <SeqEditor participants={seqParticipants} messages={seqMessages} onChange={handleSeqChange} />}
                  {diagramType === 'Gantt' && <GanttEditor title={ganttTitle} tasks={ganttTasks} onTitleChange={handleGanttTitleChange} onTaskChange={handleGanttTaskChange} onAddTask={handleAddGanttTask} onRemoveTask={handleRemoveGanttTask} />}
                  {diagramType === 'ER' && <ErEditor entities={erEntities} relations={erRelations} onChange={handleErChange} />}
                </div>
              )}
              {!hasVisualEditor && (
                <textarea ref={textareaRef} value={syntax} onChange={e => handleDslChange(e.target.value)} spellCheck={false}
                  style={{ flex: 1, background: 'var(--bg)', color: 'var(--text-primary)', border: 'none', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, lineHeight: 1.7, outline: 'none', padding: '0.75rem 1rem', resize: 'none', caretColor: 'var(--accent)', overflowY: 'auto' }} />
              )}
            </div>
          </div>
          <div style={{ flex: '0 0 58%', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', position: 'relative' as const }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '0.4rem 0.75rem', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>Preview</div>
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', background: 'var(--bg)', padding: '1.25rem 1rem', display: 'flex', alignItems: 'flex-start', justifyContent: diagramType === 'Sequence' ? 'flex-start' : 'center' }}>
              {error
                ? <div style={{ color: 'var(--red)', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre-wrap' }}>⚠ {error}</div>
                : <div ref={previewRef} dangerouslySetInnerHTML={{ __html: svg }} style={{ display: 'inline-block', textAlign: 'left' as const, whiteSpace: 'normal', flexShrink: 0, minWidth: 'min-content' }} />
              }
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', padding: '0.65rem 1rem', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button onClick={onClose} style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, padding: '0.4rem 0.9rem' }}>Cancel</button>
          <button onClick={() => { onInsert(syntax); onClose() }}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 4, color: 'var(--status-text)', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, padding: '0.4rem 0.9rem' }}>
            {mode === 'update' ? 'Update' : 'Insert'}
          </button>
        </div>
      </div>
    </div>
  )
}