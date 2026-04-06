import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'

const IGNORED_FOLDERS = new Set([
  '.git', 'node_modules', '.next', 'dist', 'build', '.cache',
  'coverage', '.turbo', 'out', '.vercel', '__pycache__', '.pytest_cache',
])

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult instanceof NextResponse) return authResult

    const { repoUrl } = await req.json()

    // Accept both "https://github.com/owner/repo" and "owner/repo"
    const match =
      repoUrl.match(/github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?(?:\/.*)?$/) ??
      repoUrl.match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/)

    if (!match) {
      return NextResponse.json({ error: 'Invalid GitHub URL. Use https://github.com/owner/repo or owner/repo' }, { status: 400 })
    }

    const [, owner, repo] = match

    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Helix-Brain/1.0',
        },
      }
    )

    if (treeRes.status === 404) {
      return NextResponse.json({ error: 'Repo not found or is private' }, { status: 404 })
    }
    if (!treeRes.ok) {
      return NextResponse.json({ error: `GitHub API error: ${treeRes.status}` }, { status: 400 })
    }

    const treeData = await treeRes.json()
    const blobs = treeData.tree.filter((i: any) => i.type === 'blob')

    const folders = new Set<string>()

    for (const item of blobs) {
      const parts: string[] = item.path.split('/')
      if (parts.length === 1) {
        folders.add('(root files)')
      } else {
        const top = parts[0]
        if (!IGNORED_FOLDERS.has(top)) {
          folders.add(top)
        }
      }
    }

    return NextResponse.json({
      owner,
      repo,
      folders: Array.from(folders).sort(),
      totalFiles: blobs.length,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}