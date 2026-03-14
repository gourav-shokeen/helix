// app/api/graph/links/route.ts — Extract wiki-link edges from all user documents
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as Y from 'yjs'

function toUint8Array(data: unknown): Uint8Array | null {
  if (!data) return null
  if (data instanceof Uint8Array) return data
  if (Buffer.isBuffer(data)) return new Uint8Array(data)
  if (typeof data === 'string') {
    // Postgres hex bytea: \x1a2b3c...
    if (data.startsWith('\\x')) return new Uint8Array(Buffer.from(data.slice(2), 'hex'))
    // PostgREST base64
    return new Uint8Array(Buffer.from(data, 'base64'))
  }
  if (Array.isArray(data)) return new Uint8Array(data as number[])
  return null
}

function extractText(node: Y.XmlFragment | Y.XmlElement): string {
  let text = ''
  node.forEach((child) => {
    if (child instanceof Y.XmlText) {
      text += child.toString()
    } else if (child instanceof Y.XmlElement) {
      text += extractText(child)
    }
  })
  return text
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: docs } = await supabase
    .from('documents')
    .select('id, title')
    .eq('owner_id', user.id)

  if (!docs?.length) return NextResponse.json({ edges: [], excerpts: {} })

  // Build title → id lookup (case-insensitive)
  const titleToId = new Map<string, string>()
  docs.forEach((d) => titleToId.set((d.title ?? '').toLowerCase().trim(), d.id))

  const edges: Array<{ source: string; target: string; type: string }> = []
  const edgeSet = new Set<string>()
  const excerpts: Record<string, string> = {}

  for (const doc of docs) {
    const { data: updates } = await supabase
      .from('document_updates')
      .select('update_data')
      .eq('document_id', doc.id)
      .order('created_at', { ascending: true })
      .limit(200)

    if (!updates?.length) continue

    try {
      const ydoc = new Y.Doc()
      for (const u of updates) {
        const bin = toUint8Array(u.update_data)
        if (bin) Y.applyUpdate(ydoc, bin)
      }

      // Try default Tiptap fragment names
      let text = extractText(ydoc.getXmlFragment('prosemirror'))
      if (!text.trim()) text = extractText(ydoc.getXmlFragment('default'))

      if (text.trim()) excerpts[doc.id] = text.trim().slice(0, 200)

      // Parse [[wiki-link]] patterns
      const wikiMatches = Array.from(text.matchAll(/\[\[([^\]\n]+)\]\]/g))
      for (const match of wikiMatches) {
        const linkedTitle = match[1].toLowerCase().trim()
        const targetId = titleToId.get(linkedTitle)
        if (targetId && targetId !== doc.id) {
          const key = [doc.id, targetId].sort().join('|')
          if (!edgeSet.has(key)) {
            edgeSet.add(key)
            edges.push({ source: doc.id, target: targetId, type: 'link' })
          }
        }
      }
    } catch {
      // Skip docs that can't be decoded
    }
  }

  return NextResponse.json({ edges, excerpts })
}
