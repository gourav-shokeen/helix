// ws-server.mjs  (used by `npm run ws` for local dev)
//
// Uses y-websocket's setupWSConnection (handles Yjs sync step1/step2/updates/awareness)
// pre-loads all historical updates from Supabase BEFORE sending step1.
//
// Node 22+ --env-file=.env.local is used to inject env vars (see package.json ws script).
//
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import * as Y from 'yjs'
import { createClient } from '@supabase/supabase-js'

const PORT = process.env.PORT || 1234
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[ws] WARNING: Supabase env vars missing — persistence and auth disabled')
}

// Service-role client: bypasses RLS so server can read/write all docs
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null

// ── Load y-websocket server utils ─────────────────────────────────────────────
// These live in helix/node_modules/y-websocket/bin/utils.cjs
const { setupWSConnection, getYDoc } = await import('./node_modules/y-websocket/bin/utils.cjs')

// ── Decode bytea from PostgREST ───────────────────────────────────────────────
// PostgREST returns bytea as '\xdeadbeef' (hex) — supabase-js sometimes base64
function decodeUpdateData(raw) {
  if (!raw) return null
  if (typeof raw === 'string') {
    if (raw.startsWith('\\x')) return Buffer.from(raw.slice(2), 'hex')
    return Buffer.from(raw, 'base64')
  }
  if (raw instanceof Uint8Array || Buffer.isBuffer(raw)) return raw
  if (Array.isArray(raw)) return new Uint8Array(raw)
  return null
}

// ── Hydrate a WSSharedDoc from Supabase BEFORE syncing ───────────────────────
// Stores a Promise on the doc so concurrent connections share a single load.
async function hydrateDoc(doc, docName) {
  if (doc._hydratePromise) return doc._hydratePromise

  doc._hydratePromise = (async () => {
    if (!supabase) return

    const { data, error } = await supabase
      .from('document_updates')
      .select('update_data')
      .eq('document_id', docName)
      .order('created_at', { ascending: true })

    if (error) {
      console.error(`[ws] load error for room=${docName}:`, error.message)
      return
    }

    if (data?.length) {
      for (const row of data) {
        try {
          const update = decodeUpdateData(row.update_data)
          if (update) Y.applyUpdate(doc, update)
        } catch (e) {
          console.error('[ws] applyUpdate error:', e)
        }
      }
      console.log(`[ws] loaded ${data.length} updates for room=${docName}`)
    } else {
      console.log(`[ws] no saved updates for room=${docName}`)
    }

    // Persist every future update to Supabase
    doc.on('update', async (update) => {
      if (!supabase) return
      try {
        const { error: err } = await supabase
          .from('document_updates')
          .insert({
            document_id: docName,
            update_data: Buffer.from(update).toString('base64'),
          })
        if (err) console.error('[ws] save error:', err.message)
      } catch (e) {
        console.error('[ws] save exception:', e)
      }
    })
  })()

  return doc._hydratePromise
}

// ── Token validation: Supabase JWT OR share_links token ──────────────────
// NOTE: ws-server.mjs is used for LOCAL DEV ONLY.
// The production Railway server (ws-server/index.mjs) enforces strict auth.
async function validateToken(token, docName) {
  // No Supabase config at all — skip auth entirely (dev convenience)
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('[ws] Auth skipped — SUPABASE env vars missing')
    return true
  }

  // No token sent — allow in local dev.
  // The browser Supabase SSR client often can't surface the session token
  // when called from inside a dynamic import (hydration timing).
  // Production Railway server handles this strictly.
  if (!token) {
    console.warn('[ws] no token — allowing for local dev')
    return true
  }

  // Attempt 1: validate as Supabase JWT (authenticated users)
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    })
    if (res.ok) return true
  } catch { /* not a JWT, try share token */ }

  // Attempt 2: validate as share_links token UUID (unauthenticated share viewers)
  if (!supabase) return false
  try {
    const { data, error } = await supabase
      .from('share_links')
      .select('doc_id, permission, expires_at')
      .eq('token', token)
      .maybeSingle()

    if (!error && data && data.doc_id === docName) {
      if (!data.expires_at || new Date(data.expires_at) > new Date()) {
        return true
      }
    }
  } catch { /* fall through */ }

  return false
}

// ── Server ────────────────────────────────────────────────────────────────────
const server = createServer((req, res) => { res.writeHead(200); res.end('ok') })
const wss = new WebSocketServer({ server })

wss.on('connection', async (ws, req) => {
  // Buffer messages that arrive before setupWSConnection takes over
  const messageBuffer = []
  const handleTempMessage = (msg, isBinary) => messageBuffer.push({ msg, isBinary })
  ws.on('message', handleTempMessage)

  let docName = 'default'
  let jwt = null

  try {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`)
    jwt = url.searchParams.get('token')
    docName = url.pathname.slice(1) || 'default'
  } catch {
    ws.close(4000, 'Bad request')
    return
  }

  console.log(`[ws] connection: room=${docName}`)

  const valid = await validateToken(jwt, docName)
  if (!valid) {
    console.warn(`[ws] unauthorized room=${docName}`)
    ws.close(4001, 'Unauthorized')
    return
  }

  // 1. Get/create WSSharedDoc in y-websocket's internal map (synchronous)
  const doc = getYDoc(docName)

  // 2. Await full Supabase hydration — doc is full before step1 is sent
  await hydrateDoc(doc, docName)

  // 3. Remove temp listener and hand over to y-websocket
  ws.off('message', handleTempMessage)
  setupWSConnection(ws, req, { docName })

  // 4. Replay any buffered messages (like the client's initial SyncStep1)
  for (const { msg, isBinary } of messageBuffer) {
    ws.emit('message', msg, isBinary)
  }
})

server.listen(PORT, () => console.log(`✅ WS server running on port ${PORT}`))