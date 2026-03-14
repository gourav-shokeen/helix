// app/api/github/issue/route.ts — Fetch a single GitHub issue
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCached, setCached } from '@/lib/githubCache'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const repo = searchParams.get('repo')   // e.g. "owner/reponame"
  const issue = searchParams.get('issue') // e.g. "42"

  if (!repo || !issue) return NextResponse.json({ error: 'Missing repo or issue param' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: conn } = await supabase
    .from('github_connections')
    .select('token')
    .eq('user_id', user.id)
    .single()

  if (!conn?.token) return NextResponse.json({ error: 'No GitHub connection' }, { status: 400 })

  const cacheKey = `issue:${repo}#${issue}`
  const cached = getCached(cacheKey)
  if (cached) return NextResponse.json(cached)

  const res = await fetch(`https://api.github.com/repos/${repo}/issues/${issue}`, {
    headers: {
      Authorization: `token ${conn.token}`,
      Accept: 'application/vnd.github+json',
    },
  })

  if (!res.ok) return NextResponse.json({ error: 'GitHub API error', status: res.status }, { status: res.status })

  const raw = await res.json() as { number: number; title: string; state: string; html_url: string }
  const result = { number: raw.number, title: raw.title, state: raw.state, url: raw.html_url }
  setCached(cacheKey, result)
  return NextResponse.json(result)
}
