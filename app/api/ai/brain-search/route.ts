import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireAuth } from '@/lib/auth/requireAuth'

interface BrainFile {
  path: string
  purpose: string
  calledBy: string[]
}

function parseJsonObject(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult instanceof NextResponse) return authResult

    const { query, fileMap } = (await request.json()) as { query?: string; fileMap?: BrainFile[] }
    const searchQuery = String(query || '').trim()
    const map = Array.isArray(fileMap) ? fileMap : []

    if (!searchQuery || map.length === 0) {
      return NextResponse.json({ results: [] })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 500 })
    }

    const client = new GoogleGenerativeAI(apiKey)
    const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const prompt = [
      'SYSTEM: Given this file map, answer the query and return ONLY valid JSON:',
      '{"results":[{"file":"string","snippet":"string","context":"string"}]}',
      `QUERY: ${searchQuery}`,
      'FILE MAP:',
      JSON.stringify(map),
    ].join('\n\n')

    const result = await model.generateContent(prompt)
    const text = result.response.text().trim()
    const parsed = parseJsonObject(text)

    if (!parsed || typeof parsed !== 'object') {
      return NextResponse.json({ error: 'Model returned invalid JSON.' }, { status: 500 })
    }

    const results = Array.isArray((parsed as { results?: unknown[] }).results)
      ? (parsed as { results: Array<{ file?: string; snippet?: string; context?: string }> }).results.map((item) => ({
          file: String(item.file || ''),
          snippet: String(item.snippet || ''),
          context: String(item.context || ''),
        })).filter((item) => item.file)
      : []

    return NextResponse.json({ results })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    )
  }
}
