// app/(public)/share/[id]/page.tsx
// Handles token-based share links AND legacy public doc links.
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import type { Document } from '@/types'
import { ShareDocViewer } from '@/components/editor/ShareDocViewer'

// Service-role client — bypasses RLS for metadata reads on public share pages.
// ONLY used for SELECT queries on share_links and documents.title.
// Auth actions still use the SSR client (user session).
const adminDb = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Props {
  params: Promise<{ id: string }>
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://helix.app'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()

  // Try token lookup first — use admin client to bypass RLS for unauthenticated viewers
  const { data: link } = await adminDb
    .from('share_links')
    .select('doc_id')
    .eq('token', id)
    .single()

  const docId = link?.doc_id ?? id
  const { data } = await adminDb.from('documents').select('title').eq('id', docId).single()

  const title = data?.title ?? 'Shared Document'
  const description = `Read "${title}" — a shared document on Helix, the AI-powered collaborative note editor.`
  const ogImage = `${APP_URL}/api/og?title=${encodeURIComponent(title)}&collab=1`

  return {
    title: `${title} — Helix`,
    description,
    openGraph: {
      title, description, type: 'article',
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image', title, description, images: [ogImage],
    },
  }
}

export default async function SharePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  // ── Try token-based share link first — use admin client to bypass RLS ──
  const { data: link } = await adminDb
    .from('share_links')
    .select('doc_id, permission')
    .eq('token', id)
    .single()

  if (link) {
    const { data: { user } } = await supabase.auth.getUser()

    if (link.permission === 'edit') {
      // Edit links require authentication — redirect to login if not signed in
      if (!user) {
        redirect(`/login?next=/share/${id}`)
      }

      // Logged-in user with edit permission → upsert membership then go to editor.
      // MUST use adminDb (service role) here — the RLS policy on document_members
      // only allows insert when auth.uid() is the document OWNER. The collaborator
      // is NOT the owner, so supabase (SSR anon/user client) would silently fail.
      await adminDb
        .from('document_members')
        .upsert(
          { document_id: link.doc_id, user_id: user.id, role: 'editor' },
          { onConflict: 'document_id,user_id', ignoreDuplicates: true }
        )

      redirect(`/doc/${link.doc_id}`)
    }

    // View-only token link → show read-only page (no auth required)
    const title = await getDocTitle(link.doc_id)
    return <ReadOnlyView docId={link.doc_id} title={title} permission="view" shareToken={id} />
  }

  // ── Fallback: legacy public doc link (id = doc uuid) ──
  const { data: doc } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .single()

  if (!doc || !(doc as Document).is_public) {
    return <PrivateDoc />
  }

  return <ReadOnlyView docId={id} title={(doc as Document).title} permission="view" shareToken={id} />
}

// ── Helpers ──────────────────────────────────────────────

// Always use the admin client here — anon RLS blocks document reads for unauthenticated viewers
async function getDocTitle(docId: string): Promise<string> {
  const { data } = await adminDb.from('documents').select('title').eq('id', docId).single()
  return data?.title ?? 'Untitled'
}

// ── UI Components ─────────────────────────────────────────

function PrivateDoc() {
  return (
    <div style={fullCenterStyle}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>🔒</div>
      <p style={{ margin: 0, color: '#888', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>
        This document is private.
      </p>
      <a href="/login" style={accentBtnStyle}>Open in Helix</a>
    </div>
  )
}

function ReadOnlyView({ docId, title, permission, shareToken }: { docId: string; title: string; permission: string; shareToken: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#0d0d1a', fontFamily: 'JetBrains Mono, monospace', color: '#e0e0e0' }}>
      {/* Header */}
      <header style={{ padding: '0 24px', height: 48, borderBottom: '1px solid #1e1e2e', background: '#080810', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: '#00d4a1', fontWeight: 700, fontSize: 15, letterSpacing: '0.05em' }}>⬡ HELIX</span>
        <span style={{ color: '#333', fontSize: 13 }}>/</span>
        <span style={{ color: '#aaa', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <span style={{ marginLeft: 4, fontSize: 10, color: '#444', background: '#1a1a2e', border: '1px solid #2a2a3e', padding: '2px 6px', borderRadius: 3 }}>
          read-only
        </span>
        <a href={`/doc/${docId}`} style={{ ...accentBtnStyle, marginLeft: 'auto', flexShrink: 0 }}>Open in Helix</a>
      </header>

      {/* Document content — rendered via Tiptap + Yjs WS sync */}
      <main style={{ flex: 1, maxWidth: 820, width: '100%', margin: '0 auto', padding: '56px 48px' }}>
        <h1 style={{ color: '#fff', fontSize: '2rem', fontWeight: 700, marginTop: 0, marginBottom: 32, lineHeight: 1.3 }}>
          {title}
        </h1>
        <ShareDocViewer docId={docId} shareToken={shareToken} />
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #1e1e2e', padding: '16px 24px', textAlign: 'center', fontSize: 12, color: '#333' }}>
        Made with{' '}
        <a href={APP_URL} style={{ color: '#00d4a1', textDecoration: 'none', fontWeight: 700 }}>Helix</a>
        {' '}— AI-powered collaborative notes
      </footer>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────

const fullCenterStyle: React.CSSProperties = {
  minHeight: '100vh', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 16,
  background: '#0d0d1a', fontFamily: 'JetBrains Mono, monospace',
}

const accentBtnStyle: React.CSSProperties = {
  display: 'inline-block', marginTop: 8,
  padding: '8px 20px', background: '#00d4a1',
  color: '#0d0d1a', borderRadius: 6,
  textDecoration: 'none', fontWeight: 700, fontSize: 13,
}