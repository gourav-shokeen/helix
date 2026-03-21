'use client'
import { Node, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { KanbanBoard } from './KanbanBoard'

interface KanbanNodeOptions {
  projectId?: string
}

function KanbanNodeView({ node, extension }: NodeViewProps) {
  const boardId = String(node.attrs.boardId || '')
  const projectId = String((extension.options as KanbanNodeOptions).projectId || '')

  if (!boardId || !projectId) {
    return (
      <NodeViewWrapper>
        <div style={{ color: 'var(--text-muted)', fontSize: 11, border: '1px dashed var(--border)', borderRadius: 6, padding: '0.6rem' }}>
          Kanban unavailable: missing board context.
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper>
      <div
        style={{ minHeight: 300, maxHeight: 320, overflowY: 'auto' }}
        onWheelCapture={(e) => e.stopPropagation()}
      >
        <KanbanBoard boardId={boardId} projectId={projectId} compact />
      </div>
    </NodeViewWrapper>
  )
}

export const KanbanBlockExtension = Node.create<KanbanNodeOptions>({
  name: 'kanbanBlock',
  group: 'block',
  atom: true,

  addOptions() {
    return {
      projectId: '',
    }
  },

  addAttributes() {
    return {
      boardId: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="kanban-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-type': 'kanban-block', 'data-board-id': HTMLAttributes.boardId }]
  },

  addNodeView() {
    return ReactNodeViewRenderer(KanbanNodeView)
  },
})