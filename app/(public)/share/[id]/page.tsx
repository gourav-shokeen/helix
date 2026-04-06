// app/(public)/share/[id]/page.tsx
// Requires authentication. Unauthenticated users are redirected to /login.
// After login, next-auth redirects back to this page via callbackUrl.
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { Document } from '@/types'

interface Props {
  params: Promise<{ id: string }>
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://helix.app'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params

  const { data: link } = await supabaseAdmin
    .from('share_links')
    .select('doc_id')
    .eq('token', id)
    .single()

  const docId = link?.doc_id ?? id
  const { data } = await supabaseAdmin.from('documents').select('title').eq('id', docId).single()

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

  // ── Auth gate — redirect to login if not signed in ──
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect(`/login?callbackUrl=/share/${id}`)
  }

  // ── Resolve share token ──
  const { data: link } = await supabaseAdmin
    .from('share_links')
    .select('doc_id, permission')
    .eq('token', id)
    .single()

  if (link) {
    const userId = session.user.id
    const role = link.permission === 'edit' ? 'editor' : 'viewer'

    // Upsert the visiting user into document_members so the doc page
    // can load for users who aren't the owner. Idempotent — safe to
    // repeat if they visit the share link multiple times.
    const { error: memberError } = await supabaseAdmin
      .from('document_members')
      .upsert(
        { document_id: link.doc_id, user_id: userId, role },
        { onConflict: 'document_id,user_id' }
      )

    if (memberError) {
      console.error('[share] Failed to upsert document_member:', memberError.message)
    }

    // Redirect to the real editor regardless of permission level.
    // The doc page will enforce read-only rendering for viewer role.
    redirect(`/doc/${link.doc_id}`)
  }

  // ── Fallback: legacy public doc link (id = doc uuid) ──
  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', id)
    .single()

  if (!doc || !(doc as Document).is_public) {
    return <PrivateDoc />
  }

  return <ReadOnlyView docId={id} title={(doc as Document).title} />
}

// ── Helpers ──────────────────────────────────────────────

async function getDocTitle(docId: string): Promise<string> {
  const { data } = await supabaseAdmin.from('documents').select('title').eq('id', docId).single()
  return data?.title ?? 'Untitled'
}

// ── UI Components ─────────────────────────────────────────

function PrivateDoc() {
  return (
    <div style={fullCenterStyle}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>🔒</div>
      <p style={{ margin: 0, color: '#888', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>
        This document is private or the link is invalid.
      </p>
      <a href="/dashboard" style={accentBtnStyle}>Go to dashboard</a>
    </div>
  )
}

function ReadOnlyView({ docId, title }: { docId: string; title: string }) {
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
        <a href="/dashboard" style={{ ...accentBtnStyle, marginLeft: 'auto', flexShrink: 0 }}>Open in Helix</a>
      </header>

      {/* Content */}
      <main style={{ flex: 1, maxWidth: 820, width: '100%', margin: '0 auto', padding: '56px 48px' }}>
        <h1 style={{ color: '#fff', fontSize: '2rem', fontWeight: 700, marginTop: 0, marginBottom: 24, lineHeight: 1.3 }}>
          {title}
        </h1>
        <p style={{ color: '#555', fontSize: 13, lineHeight: 1.7 }}>
          This is a read-only shared view.{' '}
          <a href="/dashboard" style={{ color: '#00d4a1', textDecoration: 'none' }}>Open Helix</a>{' '}
          to collaborate on documents.
        </p>
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