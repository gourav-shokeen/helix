// app/api/github/repos/route.ts — Return the authenticated user's GitHub repos
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCached, setCached } from '@/lib/githubCache'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user

  const { data: conn } = await supabaseAdmin
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
