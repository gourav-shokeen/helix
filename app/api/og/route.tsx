// app/api/og/route.tsx — Open Graph image generation (edge runtime)
import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const title = searchParams.get('title') || 'Untitled'
  const collab = searchParams.get('collab') || '1'

  return new ImageResponse(
    (
      <div
        style={{
          background: '#0d0d1a',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '60px',
          fontFamily: 'monospace',
        }}
      >
        <div style={{ color: '#00d4a1', fontSize: 26, display: 'flex', alignItems: 'center', gap: 12 }}>
          ⬡ HELIX
        </div>
        <div
          style={{
            color: '#ffffff',
            fontSize: title.length > 40 ? 44 : 56,
            fontWeight: 700,
            marginTop: 40,
            lineHeight: 1.2,
            maxWidth: 900,
          }}
        >
          {title}
        </div>
        <div style={{ color: '#555', fontSize: 20, marginTop: 'auto', display: 'flex', gap: 12 }}>
          <span>{collab} collaborator{collab !== '1' ? 's' : ''}</span>
          <span>·</span>
          <span>helix.app</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
