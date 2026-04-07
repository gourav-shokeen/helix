// ws-server/index.mjs
//
// KEY DESIGN: y-websocket's setupWSConnection sends sync step 1 SYNCHRONOUSLY
// the moment it's called. setPersistence's bindState is called but NOT awaited
// internally — meaning any async Supabase fetch races against the sync handshake
// and the client receives an empty doc.
//
// FIX: We manually call getYDoc() (from y-websocket's exported API) to create
// the WSSharedDoc in its internal map, then await our Supabase hydration, THEN
// call setupWSConnection. By the time step 1 is sent the doc is already full.
//
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import * as Y from 'yjs'
import { createClient } from '@supabase/supabase-js'

const PORT = process.env.PORT || 1234
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// ── Startup env check ─────────────────────────────────────────────────────────
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[ws] MISSING SUPABASE ENV VARS — persistence disabled')
}

// ── Supabase client (service role — bypasses RLS) ────────────────────────────
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null

// ── Load y-websocket utils ────────────────────────────────────────────────────
const ywsPath = new URL('./node_modules/y-websocket/bin/utils.cjs', import.meta.url)
const { setupWSConnection, getYDoc } = await import(ywsPath.href)

// ── Decode bytea returned by PostgREST ────────────────────────────────────────
// PostgREST can return bytea as '\xdeadbeef' (hex) or as base64 string.
// supabase-js typically returns base64; handle both defensively.
function decodeUpdateData(raw) {
  if (!raw) return null
  if (typeof raw === 'string') {
    if (raw.startsWith('\\x')) {
      // Postgres hex-encoded bytea: \xdeadbeef...
      return Buffer.from(raw.slice(2), 'hex')
    }
    // Base64 (default supabase-js encoding for bytea)
    return Buffer.from(raw, 'base64')
  }
  if (raw instanceof Uint8Array || Buffer.isBuffer(raw)) return raw
  if (Array.isArray(raw)) return new Uint8Array(raw)
  return null
}

// ── Per-doc hydration promise ─────────────────────────────────────────────────
// Stored on the WSSharedDoc instance itself to prevent double-loading on
// concurrent connections arriving for the same new room.
//
async function hydrateDoc(doc, docName) {
  // If already hydrated (or hydrating), return the same promise
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
      console.log(`[ws] no saved updates for room=${docName} (new doc)`)
    }

    // Hook persistence for future updates on this doc
    // Only attach once (guarded by _hydratePromise check above)
    doc.on('update', async (update) => {
      if (!supabase) return
      try {
        const { error: insertError } = await supabase
          .from('document_updates')
          .insert({
            document_id: docName,
            // PostgREST accepts base64 strings for bytea columns in JSON bodies
            update_data: Buffer.from(update).toString('base64'),
          })
        if (insertError) {
          console.error('[ws] save error:', insertError.message)
        }
      } catch (e) {
        console.error('[ws] save exception:', e)
      }
    })
  })()

  return doc._hydratePromise
}

// ── Token validation: Supabase JWT OR share_links token ──────────────────────
// Tries JWT first (authenticated users), falls back to share token (guests).
async function validateToken(token, docName) {
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false

  // Attempt 1: validate as Supabase JWT (authenticated users)
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
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
      // Valid share token for this exact document, and not expired
      if (!data.expires_at || new Date(data.expires_at) > new Date()) {
        return true
      }
    }
  } catch { /* fall through */ }

  return false
}

// ── HTTP + WebSocket server ───────────────────────────────────────────────────
const server = createServer((req, res) => {
  res.writeHead(200)
  res.end('ok')
})

const wss = new WebSocketServer({ server })

wss.on('connection', async (ws, req) => {
  let docName = 'default'
  let jwt = null

  try {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`)
    jwt = url.searchParams.get('token')
    // y-websocket client connects to ws://<host>/<documentId>?token=<jwt>
    docName = url.pathname.slice(1) || 'default'
  } catch {
    ws.close(4000, 'Bad request')
    return
  }

  console.log(`[ws] connection: room=${docName}`)

  // Reject unauthenticated connections (JWT or valid share token required)
  const valid = await validateToken(jwt, docName)
  if (!valid) {
    console.warn(`[ws] unauthorized for room=${docName}`)
    ws.close(4001, 'Unauthorized')
    return
  }

  // STEP 1: Get or create the WSSharedDoc in y-websocket's internal map.
  // getYDoc() is synchronous — it immediately registers the doc so subsequent
  // concurrent connections for the same room get the same instance.
  const doc = getYDoc(docName)

  // STEP 2: Await full Supabase hydration BEFORE syncing.
  // hydrateDoc() stores a Promise on the doc itself — concurrent connections
  // for the same room share the same Promise and all await it safely.
  await hydrateDoc(doc, docName)

  // STEP 3: ONLY NOW let y-websocket send sync step 1 to the client.
  // The doc is already full at this point so the client receives all content.
  setupWSConnection(ws, req, { docName })
})

server.listen(PORT, () =>
  console.log(`✅ WS server with Supabase persistence running on port ${PORT}`)
)
