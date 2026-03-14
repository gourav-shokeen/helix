// app/api/github/readme/route.ts — Fetch raw README.md for a repo
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCached, setCached } from '@/lib/githubCache'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const repo = searchParams.get('repo')

  if (!repo) return NextResponse.json({ error: 'Missing repo param' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: conn } = await supabase
    .from('github_connections')
    .select('token')
    .eq('user_id', user.id)
    .single()

  if (!conn?.token) return NextResponse.json({ error: 'No GitHub connection' }, { status: 400 })

  const cacheKey = `readme:${repo}`
  const cached = getCached(cacheKey)
  if (cached) return NextResponse.json(cached)

  const res = await fetch(`https://api.github.com/repos/${repo}/readme`, {
    headers: {
      Authorization: `token ${conn.token}`,
      Accept: 'application/vnd.github+json',
    },
  })

  if (!res.ok) return NextResponse.json({ error: 'README not found or API error' }, { status: res.status })

  const raw = await res.json() as { content: string; encoding: string; name: string }
  // GitHub returns base64-encoded content
  const markdown = Buffer.from(raw.content.replace(/\n/g, ''), 'base64').toString('utf-8')
  const result = { markdown, filename: raw.name }
  setCached(cacheKey, result, 10 * 60 * 1000) // 10-min TTL for README
  return NextResponse.json(result)
}
