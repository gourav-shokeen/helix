import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { setupWSConnection } from 'y-websocket/bin/utils.cjs'

const PORT = process.env.PORT || 1234
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// ── Auth path 1: Supabase JWT (authenticated users) ──────────────────────────
async function validateJwt(token) {
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    })
    return res.ok
  } catch {
    return false
  }
}

// ── Auth path 2: Share token (guest edit links) ───────────────────────────────
// Returns { permission: 'view'|'edit', doc_id: string } or null if invalid/expired.
// Uses service role key so we can query share_links without an auth session.
async function validateShareToken(shareToken) {
  if (!shareToken || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/share_links?token=eq.${encodeURIComponent(shareToken)}&select=permission,expires_at,doc_id`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    )
    if (!res.ok) return null
    const rows = await res.json()
    if (!Array.isArray(rows) || !rows.length) return null
    const row = rows[0]
    // Reject if expired
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null
    return { permission: row.permission, doc_id: row.doc_id }
  } catch {
    return null
  }
}

const server = createServer()
const wss = new WebSocketServer({ server })

wss.on('connection', async (ws, req) => {
  let jwt = null
  let shareToken = null

  try {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    jwt = url.searchParams.get('token')
    shareToken = url.searchParams.get('share_token')
  } catch {
    // malformed URL
  }

  if (jwt) {
    // ── Path 1: authenticated user JWT ──────────────────────────────────────
    const valid = await validateJwt(jwt)
    if (!valid) {
      ws.close(4001, 'Unauthorized')
      return
    }
    setupWSConnection(ws, req)
  } else if (shareToken) {
    // ── Path 2: guest share token ────────────────────────────────────────────
    const shareRow = await validateShareToken(shareToken)
    if (!shareRow) {
      ws.close(4001, 'Unauthorized')
      return
    }
    if (shareRow.permission === 'view') {
      // View-only guests must not establish a live WS connection —
      // the client should render a static snapshot instead.
      ws.close(4003, 'ViewOnly')
      return
    }
    // permission === 'edit' — allow collaborative connection
    setupWSConnection(ws, req)
  } else {
    // No credentials at all
    ws.close(4001, 'Unauthorized')
  }
})

server.listen(PORT, () => console.log(`✅ y-websocket running on port ${PORT}`))