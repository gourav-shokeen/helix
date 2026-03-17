// lib/diagramExport.ts
import { getMermaidConfig } from '@/lib/mermaidTheme'

async function svgToPngBase64(svgString: string, width = 1800, height = 1000): Promise<string> {
  return new Promise((resolve, reject) => {
    // Use base64 data URL instead of blob URL.
    // Blob URLs taint the canvas (browser treats them as cross-origin),
    // causing "Failed to execute 'toDataURL' on 'HTMLCanvasElement'".
    const encoded = btoa(unescape(encodeURIComponent(svgString)))
    const dataUrl = `data:image/svg+xml;base64,${encoded}`
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight)
      const dx = (width - img.naturalWidth * scale) / 2
      const dy = (height - img.naturalHeight * scale) / 2
      ctx.drawImage(img, dx, dy, img.naturalWidth * scale, img.naturalHeight * scale)
      resolve(canvas.toDataURL('image/png').split(',')[1])
    }
    img.onerror = (e) => reject(e)
    img.src = dataUrl
  })
}

export async function renderDiagramsForExport(
  tiptapJson: any
): Promise<Record<string, string>> {
  const mermaid = (await import('mermaid')).default
  mermaid.initialize(getMermaidConfig())

  const images: Record<string, string> = {}
  const nodes: { id: string; dsl: string }[] = []

  function walk(node: any) {
    if (!node) return
    if (node.type === 'diagram' && node.attrs?.dsl) {
      nodes.push({ id: node.attrs.id ?? node.attrs.dsl, dsl: node.attrs.dsl })
    }
    for (const child of node.content ?? []) walk(child)
  }
  walk(tiptapJson)

  for (const { id, dsl } of nodes) {
    try {
      const renderId = `export-diagram-${Math.random().toString(36).slice(2)}`
      const { svg } = await mermaid.render(renderId, dsl)
      const png = await svgToPngBase64(svg)
      images[id] = png
    } catch (e) {
      console.warn('[helix] diagram export render failed for', id, e)
    }
  }

  return images
}