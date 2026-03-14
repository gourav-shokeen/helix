import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function POST(request: NextRequest) {
  try {
    const { gitInput } = (await request.json()) as { gitInput?: string }
    const input = String(gitInput || '').trim()

    if (!input) {
      return NextResponse.json({ summary: '' })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 500 })
    }

    const client = new GoogleGenerativeAI(apiKey)
    const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const prompt = [
      'SYSTEM: Write a 2-3 sentence plain English summary of what a developer did today based on this git output. Be specific.',
      'Output plain text only.',
      '',
      input,
    ].join('\n')

    const result = await model.generateContent(prompt)
    const summary = result.response.text().trim()
    return NextResponse.json({ summary })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate summary' },
      { status: 500 }
    )
  }
}
