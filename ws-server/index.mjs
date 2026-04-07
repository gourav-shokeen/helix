// ws-server/index.mjs
// Yjs WebSocket server with Supabase persistence.
// Uses y-websocket's setPersistence API:
//   - bindState  → load all historical updates from Supabase when a room opens
//   - ydoc 'update' listener → save every new edit to Supabase
//   - setupWSConnection → handles the full Yjs sync protocol
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

// ── Supabase client (service role key — bypasses RLS for server-side ops) ─────
// Created lazily to avoid crash when env vars are missing (e.g. local dev without .env)
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null

// ── Load y-websocket utils ────────────────────────────────────────────────────
const ywsPath = new URL('./node_modules/y-websocket/bin/utils.cjs', import.meta.url)
const { setupWSConnection, setPersistence } = await import(ywsPath.href)

// ── Decode bytea from PostgREST (base64 string or array) ─────────────────────
function decodeUpdateData(raw) {
  if (!raw) return null
  if (typeof raw === 'string') {
    // PostgREST returns bytea as base64 string
    return Buffer.from(raw, 'base64')
  }
  if (raw instanceof Uint8Array || Buffer.isBuffer(raw)) return raw
  if (Array.isArray(raw)) return new Uint8Array(raw)
  return null
}

// ── Register Supabase persistence with y-websocket ────────────────────────────
// bindState is called once per room, before any sync messages are sent.
// This is the correct place to hydrate the ydoc from Supabase.
setPersistence({
  bindState: async (docName, ydoc) => {
    if (!supabase) return

    // Load ALL persisted updates in insertion order
    const { data, error } = await supabase
      .from('document_updates')
      .select('update_data')
      .eq('document_id', docName)
      .order('created_at', { ascending: true })

    if (error) {
      console.error(`[ws] failed to load updates for ${docName}:`, error.message)
      return
    }

    if (data?.length) {
      for (const row of data) {
        try {
          const update = decodeUpdateData(row.update_data)
          if (update) Y.applyUpdate(ydoc, update)
        } catch (e) {
          console.error('[ws] applyUpdate error:', e)
        }
      }
      console.log(`[ws] loaded ${data.length} updates for room=${docName}`)
    }

    // Persist every future update to Supabase
    ydoc.on('update', async (update) => {
      if (!supabase) return
      try {
        // PostgREST accepts bytea as a base64 string in JSON bodies
        const { error: insertError } = await supabase
          .from('document_updates')
          .insert({
            document_id: docName,
            update_data: Buffer.from(update).toString('base64'),
          })
        if (insertError) {
          console.error('[ws] failed to save update:', insertError.message)
        }
      } catch (e) {
        console.error('[ws] save error:', e)
      }
    })
  },

  // Called when the last connection to a room closes — no-op since we persist per-update
  writeState: (_docName, _ydoc) => Promise.resolve(),
})

// ── JWT validation via Supabase Auth REST ─────────────────────────────────────
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

// ── HTTP server (health check) + WebSocket server ────────────────────────────
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

  // Reject unauthenticated connections
  const valid = await validateJwt(jwt)
  if (!valid) {
    console.warn(`[ws] unauthorized connection attempt for room=${docName}`)
    ws.close(4001, 'Unauthorized')
    return
  }

  // setupWSConnection handles the full Yjs sync protocol (step1/step2/update/awareness).
  // It will call our bindState hook on first connection to this room.
  setupWSConnection(ws, req, { docName })
})

server.listen(PORT, () =>
  console.log(`✅ WS server with Supabase persistence running on port ${PORT}`)
)
