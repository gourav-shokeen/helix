import { NextRequest, NextResponse } from 'next/server'
import type { BrainFile } from '@/store/brainStore'

// Increase Vercel timeout to 120s for large repos
export const maxDuration = 120

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.rb', '.php',
  '.swift', '.kt', '.vue', '.svelte',
  '.css', '.scss', '.sass',
  '.sql', '.prisma',
  '.md', '.mdx',
])

const IGNORED_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '.DS_Store', 'Thumbs.db',
])

const IGNORED_FOLDERS = new Set([
  '.git', 'node_modules', '.next', 'dist', 'build',
  '.cache', 'coverage', '.turbo', 'out', '.vercel',
])

// Groq free tier: 30 RPM, 14,400 req/day — safe at 1 req/3s
const BATCH_SIZE = 3
const RATE_LIMIT_DELAY_MS = 15000
const MAX_CONTENT_CHARS = 800
const MAX_FILES = 60 // per file, to stay within context

function getExtension(path: string): string {
  const lastDot = path.lastIndexOf('.')
  return lastDot >= 0 ? path.slice(lastDot).toLowerCase() : ''
}

async function fetchFileContent(owner: string, repo: string, path: string): Promise<string> {
  for (const branch of ['main', 'master', 'HEAD']) {
    const res = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
    )
    if (res.ok) {
      const text = await res.text()
      return text.slice(0, MAX_CONTENT_CHARS)
    }
  }
  return ''
}

async function analyseBatch(
  files: Array<{ path: string; content: string }>,
  apiKey: string
): Promise<BrainFile[]> {
  const fileList = files
    .map(f => `### FILE: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n---\n\n')

  const prompt = `You are a senior developer doing a codebase analysis. For each file below, identify:
1. Its PURPOSE (1-2 sentences, what it does and why it exists)
2. FILES IT CALLS/IMPORTS (other files in this codebase it depends on, use exact paths as given)
3. FILES THAT CALL IT (infer from import patterns you can see across all files provided)

Return ONLY a raw JSON object — no markdown fences, no explanation, no preamble:
{
  "files": [
    {
      "path": "exact/path/as/given/above",
      "purpose": "concise description",
      "calls": ["path/to/dependency.ts"],
      "calledBy": ["path/to/caller.ts"]
    }
  ]
}

If you cannot determine calls/calledBy, use empty arrays. Do NOT invent paths.

FILES TO ANALYSE:

${fileList}`

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 8192,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Groq API error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content ?? ''

  // Strip any accidental markdown fences
  const clean = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

  try {
    const parsed = JSON.parse(clean)
    return parsed.files as BrainFile[]
  } catch {
    const jsonMatch = clean.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return parsed.files as BrainFile[]
    }
    throw new Error('Failed to parse Groq response as JSON')
  }
}

async function generateSummary(fileMap: BrainFile[], apiKey: string): Promise<string> {
  const fileList = fileMap
    .map(f => `${f.path}: ${f.purpose}`)
    .join('\n')

  const prompt = `Based on this list of files and their purposes from a codebase, write a concise 3-sentence project summary covering: (1) what the project does, (2) its main architecture/stack, and (3) the key entry points or most important files.

Files:
${fileList}

Return only the summary text, no JSON, no headings.`

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 512,
    }),
  })

  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}

export async function POST(req: NextRequest) {
  try {
    const { owner, repo, folders } = await req.json()
    const apiKey = process.env.GROQ_API_KEY

    if (!apiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY is not set in environment' }, { status: 500 })
    }
    if (!owner || !repo || !folders?.length) {
      return NextResponse.json({ error: 'Missing owner, repo, or folders' }, { status: 400 })
    }

    // 1. Fetch full tree
    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
      { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Helix-Brain/1.0' } }
    )

    if (!treeRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch repo tree' }, { status: 400 })
    }

    const treeData = await treeRes.json()
    const selectedFolders = new Set<string>(folders)
    const includeRoot = selectedFolders.has('(root files)')

    // 2. Filter to selected folders + relevant extensions
    const filteredPaths: string[] = treeData.tree
      .filter((item: any) => {
        if (item.type !== 'blob') return false

        const filename = item.path.split('/').pop() ?? ''
        if (IGNORED_FILES.has(filename)) return false

        const ext = getExtension(item.path)
        if (!CODE_EXTENSIONS.has(ext)) return false

        const parts = item.path.split('/')
        const topFolder = parts[0]

        if (IGNORED_FOLDERS.has(topFolder)) return false

        if (parts.length === 1) return includeRoot
        return selectedFolders.has(topFolder)
      })
      .map((item: any) => item.path)
      .slice(0, MAX_FILES)

    if (filteredPaths.length === 0) {
      return NextResponse.json({ error: 'No analysable files found in selected folders' }, { status: 400 })
    }

    // 3. Fetch file contents in parallel (batched for concurrency control)
    const FETCH_CONCURRENCY = 8
    const filesWithContent: Array<{ path: string; content: string }> = []

    for (let i = 0; i < filteredPaths.length; i += FETCH_CONCURRENCY) {
      const batch = filteredPaths.slice(i, i + FETCH_CONCURRENCY)
      const results = await Promise.all(
        batch.map(path => fetchFileContent(owner, repo, path).then(content => ({ path, content })))
      )
      filesWithContent.push(...results.filter(f => f.content.trim().length > 0))
    }

    // 4. Analyse in batches (respect Groq rate limits)
    const allBrainFiles: BrainFile[] = []

    for (let i = 0; i < filesWithContent.length; i += BATCH_SIZE) {
      const batch = filesWithContent.slice(i, i + BATCH_SIZE)
      const results = await analyseBatch(batch, apiKey)
      allBrainFiles.push(...results)

      // Rate limit delay between batches (skip after last batch)
      if (i + BATCH_SIZE < filesWithContent.length) {
        await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS))
      }
    }

    // 5. Generate project summary
    const summary = await generateSummary(allBrainFiles, apiKey)

    return NextResponse.json({ fileMap: allBrainFiles, summary })
  } catch (e) {
    console.error('[brain-repo/analyse]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}