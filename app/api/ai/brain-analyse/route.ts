import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

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
    const { pastedContent } = (await request.json()) as { pastedContent?: string }
    const content = String(pastedContent || '').trim()

    if (!content) {
      return NextResponse.json({ files: [], summary: '' })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 500 })
    }

    const client = new GoogleGenerativeAI(apiKey)
    const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const prompt = [
      'SYSTEM: You are a code analyst. Return ONLY valid JSON with this exact shape:',
      '{"files":[{"path":"string","purpose":"string","calledBy":["string"]}],"summary":"string"}',
      'USER INPUT:',
      content,
    ].join('\n\n')

    const result = await model.generateContent(prompt)
    const text = result.response.text().trim()
    const parsed = parseJsonObject(text)

    if (!parsed || typeof parsed !== 'object') {
      return NextResponse.json({ error: 'Model returned invalid JSON.' }, { status: 500 })
    }

    const files = Array.isArray((parsed as { files?: unknown[] }).files)
      ? (parsed as { files: Array<{ path?: string; purpose?: string; calledBy?: string[] }> }).files.map((file) => ({
          path: String(file.path || ''),
          purpose: String(file.purpose || ''),
          calledBy: Array.isArray(file.calledBy) ? file.calledBy.map((item) => String(item)) : [],
        })).filter((file) => file.path)
      : []

    const summary = String((parsed as { summary?: string }).summary || '')
    return NextResponse.json({ files, summary })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyse input' },
      { status: 500 }
    )
  }
}
