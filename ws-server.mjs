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

// ── Auth path 1: next-auth authenticated users ───────────────────────────────
// The Editor client sends ?user=<uuid> (the next-auth session.user.id).
// Any user that reaches the WS server has already been authenticated by
// next-auth middleware on the Next.js app. We accept any non-empty UUID.
function validateUserId(userId) {
  return typeof userId === 'string' && userId.length > 0
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
  let userId = null
  let shareToken = null
  let docName = 'default'

  try {
    const url = new URL(rawPath, `http://localhost:${PORT}`)
    userId = url.searchParams.get('user')       // next-auth UUID
    shareToken = url.searchParams.get('share_token')
    // pathname is e.g. /my-doc-id — strip leading slash
    docName = url.pathname.slice(1) || 'default'
  } catch {
    // malformed URL — fall through, both tokens will be null → rejected below
  }

  if (userId) {
    // ── Path 1: authenticated user (next-auth UUID) ──────────────────────────
    if (!validateUserId(userId)) {
      ws.close(4001, 'Unauthorized')
      return
    }
    console.log(`[ws] user ${userId} connected to doc ${docName}`)
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
    console.log(`[ws] share-token user connected to doc ${docName}`)
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