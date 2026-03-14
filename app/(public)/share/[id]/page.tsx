// app/(public)/share/[id]/page.tsx - Read-only public document view
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import type { Document } from '@/types'

interface Props {
  params: Promise<{ id: string }>
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://helix.app'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('documents').select('title').eq('id', id).single()

  const title = data?.title ?? 'Shared Document'
  const description = `Read "${title}" — a shared document on Helix, the AI-powered collaborative note editor.`
  const ogImage = `${APP_URL}/api/og?title=${encodeURIComponent(title)}&collab=1`

  return {
    title: `${title} — Helix`,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  }
}

export default async function SharePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: doc } = await supabase.from('documents').select('*').eq('id', id).single()

  if (!doc || !(doc as Document).is_public) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          fontFamily: 'JetBrains Mono, monospace',
          background: '#0d0d1a',
          color: '#555',
          fontSize: '14px',
        }}
      >
        <div style={{ fontSize: '32px' }}>🔒</div>
        <p style={{ margin: 0, color: '#888' }}>This document is private.</p>
        <a
          href="/login"
          style={{
            marginTop: '8px',
            padding: '8px 20px',
            background: '#00d4a1',
            color: '#0d0d1a',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '13px',
          }}
        >
          Open in Helix
        </a>
      </div>
    )
  }

  const document = doc as Document

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#0d0d1a',
        fontFamily: 'JetBrains Mono, monospace',
        color: '#e0e0e0',
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: '0 24px',
          height: '48px',
          borderBottom: '1px solid #1e1e2e',
          background: '#080810',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <span style={{ color: '#00d4a1', fontWeight: 700, fontSize: '15px', letterSpacing: '0.05em' }}>
          ⬡ HELIX
        </span>
        <span style={{ color: '#333', fontSize: '13px' }}>/</span>
        <span style={{ color: '#aaa', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {document.title}
        </span>
        <span
          style={{
            marginLeft: '4px',
            fontSize: '10px',
            color: '#444',
            background: '#1a1a2e',
            border: '1px solid #2a2a3e',
            padding: '2px 6px',
            borderRadius: '3px',
          }}
        >
          read-only
        </span>
        <a
          href="/login"
          style={{
            marginLeft: 'auto',
            padding: '6px 16px',
            background: '#00d4a1',
            color: '#0d0d1a',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '12px',
            letterSpacing: '0.03em',
            flexShrink: 0,
          }}
        >
          Open in Helix
        </a>
      </header>

      {/* Content */}
      <main style={{ flex: 1, maxWidth: '820px', width: '100%', margin: '0 auto', padding: '56px 48px' }}>
        <h1
          style={{
            color: '#ffffff',
            fontSize: '2rem',
            fontWeight: 700,
            marginTop: 0,
            marginBottom: '24px',
            lineHeight: 1.3,
          }}
        >
          {document.title}
        </h1>
        <p style={{ color: '#555', fontSize: '13px', lineHeight: 1.7 }}>
          This is a read-only shared view.{' '}
          <a href="/login" style={{ color: '#00d4a1', textDecoration: 'none' }}>
            Sign in to Helix
          </a>{' '}
          to collaborate on this document.
        </p>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid #1e1e2e',
          padding: '16px 24px',
          textAlign: 'center',
          fontSize: '12px',
          color: '#333',
        }}
      >
        Made with{' '}
        <a href={APP_URL} style={{ color: '#00d4a1', textDecoration: 'none', fontWeight: 700 }}>
          Helix
        </a>{' '}
        — AI-powered collaborative notes
      </footer>
    </div>
  )
}
