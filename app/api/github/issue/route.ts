// app/api/github/issue/route.ts — Fetch a single GitHub issue
import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCached, setCached } from '@/lib/githubCache'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const repo = searchParams.get('repo')
  const issue = searchParams.get('issue')

  if (!repo || !issue) return NextResponse.json({ error: 'Missing repo or issue param' }, { status: 400 })

  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user

  const { data: conn } = await supabaseAdmin
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
