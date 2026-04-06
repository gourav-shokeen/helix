import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { entries } = (await request.json()) as { entries?: string[] }
    const list = Array.isArray(entries) ? entries.filter(Boolean) : []
    if (list.length === 0) {
      return NextResponse.json({ summary: 'No decisions to summarise yet.' })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ summary: 'GEMINI_API_KEY is not configured.' })
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const prompt = `Summarise these engineering decisions into a concise project planning summary. Keep it practical and readable.\n\n${list.join('\n\n- ')}`
    const result = await model.generateContent(prompt)
    const summary = result.response.text()

    return NextResponse.json({ summary })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to summarise' }, { status: 500 })
  }
}