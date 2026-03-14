// app/api/github/commits/route.ts — Fetch recent commits for a repo
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCached, setCached } from '@/lib/githubCache'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const repo = searchParams.get('repo')
  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 30)

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

  const cacheKey = `commits:${repo}:${limit}`
  const cached = getCached(cacheKey)
  if (cached) return NextResponse.json({ commits: cached })

  const res = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=${limit}`, {
    headers: {
      Authorization: `token ${conn.token}`,
      Accept: 'application/vnd.github+json',
    },
  })

  if (!res.ok) return NextResponse.json({ error: 'GitHub API error' }, { status: res.status })

  const raw = await res.json() as Array<{
    sha: string
    commit: { message: string; author: { name: string; date: string } }
    html_url: string
  }>

  const commits = raw.map(c => ({
    sha: c.sha.slice(0, 7),
    message: c.commit.message.split('\n')[0].slice(0, 72),
    author: c.commit.author.name,
    date: c.commit.author.date,
    url: c.html_url,
  }))

  setCached(cacheKey, commits)
  return NextResponse.json({ commits })
}
