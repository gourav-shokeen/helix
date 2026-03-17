// hooks/useDocxExport.ts
// Drop-in hook — call exportDocx() from your toolbar/command palette button
import { renderDiagramsForExport } from '@/lib/diagramExport'

export function useDocxExport() {
  async function exportDocx({
    content,        // Tiptap JSON (editor.getJSON())
    title,          // document title string
    documentId,     // Supabase document id (for kanban board fetch)
  }: {
    content: any
    title: string
    documentId?: string
  }) {
    try {
      // 1. Pre-render every diagram node → base64 PNG map
      //    Must run in browser (uses canvas API) — cannot run in route.ts
      const diagramImages = await renderDiagramsForExport(content)

      // 2. POST everything to the route
      const res = await fetch('/api/export/docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, title, documentId, diagramImages }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Export failed')
      }

      // 3. Trigger browser download
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('[helix] docx export error:', e)
      throw e
    }
  }

  return { exportDocx }
}