import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { createClient } from '@/lib/supabase/server'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { content, title } = (await request.json()) as { content: string; title?: string }

        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

        const prompt = `Generate a professional GitHub README.md for a project called "${title ?? 'Project'}" based on the following content.
Include: title with emoji, badges section placeholder, description, features, getting started, usage, and contributing sections.
Use proper markdown formatting.

Content:
${content}

Return ONLY the README markdown, nothing else.`

        const result = await model.generateContent(prompt)
        const readme = result.response.text()

        return NextResponse.json({ readme })
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 })
    }
}