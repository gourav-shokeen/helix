import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function POST(request: NextRequest) {
  try {
    const { commits } = (await request.json()) as { commits?: string }
    const input = String(commits || '').trim()

    if (!input) {
      return NextResponse.json({ summary: 'No commit log provided.' })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ summary: 'GEMINI_API_KEY is not configured.' })
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const prompt = [
      'You are summarizing recent engineering work for a daily dev log.',
      'Given this git log, produce a concise plain-text summary for the section titled "What I built".',
      'Keep it factual, practical, and 4-7 bullet points maximum.',
      '',
      input,
    ].join('\n')

    const result = await model.generateContent(prompt)
    const summary = result.response.text().trim()

    return NextResponse.json({ summary: summary || 'No summary generated.' })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate summary' },
      { status: 500 }
    )
  }
}
