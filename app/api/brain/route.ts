// app/api/brain/route.ts — Gemini AI analysis (gemini-1.5-flash)
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { BrainMode } from '@/types'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

const PROMPTS: Record<BrainMode, (content: string) => string> = {
    explain: (content) =>
        `You are a code explainer. Given this folder tree or code content, explain each file/section in plain English:
filename → what it does. who uses it.
Be concise, use bullet points.

Content:
${content}`,

    imports: (content) =>
        `You are a dependency analyzer. Given this code or package.json, generate a Mermaid graph TD dependency diagram.
Return ONLY valid Mermaid syntax, nothing else.

Content:
${content}`,

    find: (content) =>
        `You are a code navigator. The user wants to find something in their codebase.
List relevant files and describe exactly where the thing is used.
Format: filename → description of usage.

Content/Query:
${content}`,

    summarize: (content) =>
        `You are a git log summarizer. Summarize the following git log in 3-5 sentences using "you" (e.g. "you fixed...", "you added...").
Be human-readable and friendly.

Git log:
${content}`,
}

export async function POST(request: NextRequest) {
    try {
        const { mode, content } = (await request.json()) as { mode: BrainMode; content: string }

        if (!mode || !PROMPTS[mode]) {
            return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
        const prompt = PROMPTS[mode](content ?? '')
        const result = await model.generateContent(prompt)
        const text = result.response.text()

        return NextResponse.json({ result: text })
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 })
    }
}
