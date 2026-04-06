import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import * as Y from 'yjs'

const PORT = process.env.PORT || 1234
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const docs = new Map()

function getDoc(docName) {
  if (!docs.has(docName)) docs.set(docName, new Y.Doc())
  return docs.get(docName)
}

// ── Auth path 1: next-auth session token (authenticated users) ───────────────
// The WS client passes the next-auth session token cookie value as ?token=
// We validate it by calling the next-auth session endpoint on the app server.
const NEXTAUTH_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'

async function validateJwt(token) {
  if (!token) return false
  try {
    const res = await fetch(`${NEXTAUTH_URL}/api/auth/session`, {
      headers: {
        // next-auth reads the session cookie; we pass the raw session token
        // using the __Secure- or default cookie name depending on environment.
        Cookie: `next-auth.session-token=${token}; __Secure-next-auth.session-token=${token}`,
      },
    })
    if (!res.ok) return false
    const json = await res.json()
    // A valid session returns { user: { id, email, ... }, expires: '...' }
    return !!(json?.user?.id)
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
  let rawPath = req.url || '/'
  let jwt = null
  let shareToken = null
  let docName = 'default'

  try {
    const url = new URL(rawPath, `http://localhost:${PORT}`)
    jwt = url.searchParams.get('token')
    shareToken = url.searchParams.get('share_token')
    // pathname is e.g. /my-doc-id — strip leading slash
    docName = url.pathname.slice(1) || 'default'
  } catch {
    // malformed URL — fall through, both tokens will be null → rejected below
  }

  if (jwt) {
    // ── Path 1: authenticated user JWT ──────────────────────────────────────
    const valid = await validateJwt(jwt)
    if (!valid) {
      ws.close(4001, 'Unauthorized')
      return
    }
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
  } else {
    // No credentials at all
    ws.close(4001, 'Unauthorized')
    return
  }

  // ── Shared connection logic (both auth paths) ─────────────────────────────
  const doc = getDoc(docName)
  const conns = doc.conns || (doc.conns = new Map())
  conns.set(ws, new Set())

  ws.on('message', (msg) => {
    const data = new Uint8Array(msg)
    // broadcast to all other clients on same doc
    conns.forEach((_, client) => {
      if (client !== ws && client.readyState === ws.OPEN) {
        client.send(data)
      }
    })
  })

  ws.on('close', () => conns.delete(ws))
  ws.on('error', () => conns.delete(ws))
})

server.listen(PORT, () => console.log(`✅ WS server running on port ${PORT}`))