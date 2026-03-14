// app/api/github/repos/route.ts — Return the authenticated user's GitHub repos
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCached, setCached } from '@/lib/githubCache'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch stored PAT
  const { data: conn } = await supabase
    .from('github_connections')
    .select('token')
    .eq('user_id', user.id)
    .single()

  if (!conn?.token) return NextResponse.json({ error: 'No GitHub connection' }, { status: 400 })

  const cacheKey = `repos:${user.id}`
  const cached = getCached<unknown[]>(cacheKey)
  if (cached) return NextResponse.json({ repos: cached })

  const res = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator', {
    headers: {
      Authorization: `token ${conn.token}`,
      Accept: 'application/vnd.github+json',
    },
  })

  if (!res.ok) return NextResponse.json({ error: 'GitHub API error' }, { status: res.status })

  const raw = await res.json() as Array<{ full_name: string; description: string | null; private: boolean }>
  const repos = raw.map(r => ({ full_name: r.full_name, description: r.description, private: r.private }))
  setCached(cacheKey, repos)
  return NextResponse.json({ repos })
}
