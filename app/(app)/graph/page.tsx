'use client'
// app/(app)/graph/page.tsx
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { getMyDocuments } from '@/lib/supabase/documents'
import { KnowledgeGraph, type EdgeData } from '@/components/graph/KnowledgeGraph'
import { TopBar } from '@/components/layout/TopBar'
import type { Document } from '@/types'

export default function GraphPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [docs, setDocs] = useState<Document[]>([])
  const [edges, setEdges] = useState<EdgeData[]>([])
  const [excerpts, setExcerpts] = useState<Record<string, string>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [connectedOnly, setConnectedOnly] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  useEffect(() => {
    if (!user) return
    getMyDocuments(user.id).then(({ data }) => setDocs((data as Document[]) ?? []))
  }, [user])

  // Fetch wiki-link edges once docs are loaded
  useEffect(() => {
    if (!user || docs.length === 0) return
    fetch('/api/graph/links')
      .then((r) => r.json())
      .then(({ edges: e = [], excerpts: ex = {} }) => {
        setEdges(e)
        setExcerpts(ex)
      })
      .catch(() => {/* silently skip if API unavailable */})
  }, [user, docs.length])

  if (loading || !user) return null

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopBar docTitle="" onTitleChange={() => {}} showDoc={false} />
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <KnowledgeGraph
          docs={docs}
          edges={edges}
          excerpts={excerpts}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          connectedOnly={connectedOnly}
          onConnectedOnlyChange={setConnectedOnly}
          onNodeClick={(id) => router.push(`/doc/${id}`)}
        />
      </div>
    </div>
  )
}

