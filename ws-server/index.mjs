// ws-server/index.mjs
// y-websocket server with Supabase persistence.
// Loads historical Yjs updates on first connection, persists all changes.
//
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as map from 'lib0/map'

const PORT = process.env.PORT || 1234
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// ── Message type constants (matching y-websocket protocol) ────────────────────
const messageSync = 0
const messageAwareness = 1

// ── In-memory doc store ───────────────────────────────────────────────────────
// { docName -> { ydoc, awareness, conns: Map<ws, Set>, loaded: bool } }
const docs = new Map()

function getYDoc(docName) {
  return map.setIfUndefined(docs, docName, () => {
    const ydoc = new Y.Doc()
    const awareness = new awarenessProtocol.Awareness(ydoc)
    awareness.setLocalState(null)
    const entry = { ydoc, awareness, conns: new Map(), loaded: false }
    docs.set(docName, entry)
    return entry
  })
}

// ── Supabase helpers (service role key — bypass RLS) ─────────────────────────
async function loadUpdatesFromSupabase(docName) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return []
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/document_updates?document_id=eq.${encodeURIComponent(docName)}&select=update_data&order=created_at.asc`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    )
    if (!res.ok) return []
    const rows = await res.json()
    return Array.isArray(rows) ? rows : []
  } catch (e) {
    console.error('[ws] loadUpdates error:', e)
    return []
  }
}

async function saveUpdateToSupabase(docName, updateData) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/document_updates`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        document_id: docName,
        // Store as base64 string so it survives JSON transport
        update_data: Buffer.from(updateData).toString('base64'),
      }),
    })
  } catch (e) {
    console.error('[ws] saveUpdate error:', e)
  }
}

// ── Load historical updates into ydoc (once per doc) ─────────────────────────
async function ensureLoaded(entry, docName) {
  if (entry.loaded) return
  entry.loaded = true // set early to prevent double-loading on concurrent connections
  const rows = await loadUpdatesFromSupabase(docName)
  if (rows.length === 0) return
  for (const row of rows) {
    try {
      let updateData
      if (typeof row.update_data === 'string') {
        // base64 string
        updateData = Buffer.from(row.update_data, 'base64')
      } else if (Array.isArray(row.update_data)) {
        // numeric array (stored via older format)
        updateData = Uint8Array.from(row.update_data)
      } else {
        continue
      }
      Y.applyUpdate(entry.ydoc, updateData)
    } catch (e) {
      console.error('[ws] applyUpdate error for', docName, e)
    }
  }
  console.log(`[ws] Loaded ${rows.length} updates for ${docName}`)
}

// ── Auth ──────────────────────────────────────────────────────────────────────
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

// ── Send a sync message to a single connection ────────────────────────────────
function send(conn, message) {
  if (conn.readyState === conn.OPEN) {
    try { conn.send(message) } catch { /* ignore */ }
  }
}

// ── Sync protocol helpers ─────────────────────────────────────────────────────
function sendSyncStep1(conn, ydoc) {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageSync)
  syncProtocol.writeSyncStep1(encoder, ydoc)
  send(conn, encoding.toUint8Array(encoder))
}

function sendSyncStep2(conn, ydoc, encodedStateVector) {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageSync)
  syncProtocol.writeSyncStep2(encoder, ydoc, encodedStateVector)
  send(conn, encoding.toUint8Array(encoder))
}

function broadcastUpdate(entry, update, origin) {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageSync)
  syncProtocol.writeUpdate(encoder, update)
  const message = encoding.toUint8Array(encoder)
  entry.conns.forEach((_, conn) => {
    if (conn !== origin) send(conn, message)
  })
}

// ── WebSocket connection handler ──────────────────────────────────────────────
const server = createServer((req, res) => {
  // Health check
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
    docName = url.pathname.slice(1) || 'default'
  } catch {
    ws.close(4000, 'Bad request')
    return
  }

  // Auth check
  const valid = await validateJwt(jwt)
  if (!valid) {
    ws.close(4001, 'Unauthorized')
    return
  }

  console.log(`[ws] connection: room=${docName}`)

  const entry = getYDoc(docName)

  // Load historical updates from Supabase (no-op after first load)
  await ensureLoaded(entry, docName)

  // Register connection
  entry.conns.set(ws, new Set())

  // Send sync step 1 to new client
  sendSyncStep1(ws, entry.ydoc)

  // Send current awareness state
  const awarenessStates = entry.awareness.getStates()
  if (awarenessStates.size > 0) {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, messageAwareness)
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(entry.awareness, Array.from(awarenessStates.keys()))
    )
    send(ws, encoding.toUint8Array(encoder))
  }

  ws.on('message', async (data) => {
    const msg = new Uint8Array(data)
    try {
      const decoder = decoding.createDecoder(msg)
      const messageType = decoding.readVarUint(decoder)

      if (messageType === messageSync) {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, messageSync)
        const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, entry.ydoc, ws)

        // If this was an update (type 2), persist it and broadcast
        if (syncMessageType === 2) {
          // Re-decode to get raw update bytes for storage
          const updateDecoder = decoding.createDecoder(msg)
          decoding.readVarUint(updateDecoder) // messageSync
          decoding.readVarUint(updateDecoder) // messageYjsSyncUpdate (2)
          const rawUpdate = decoding.readVarUint8Array(updateDecoder)
          // Persist to Supabase
          saveUpdateToSupabase(docName, rawUpdate)
          // Apply to local ydoc
          Y.applyUpdate(entry.ydoc, rawUpdate, ws)
          // Broadcast to others
          broadcastUpdate(entry, rawUpdate, ws)
        }

        // Send back step2 if needed
        if (encoding.length(encoder) > 1) {
          send(ws, encoding.toUint8Array(encoder))
        }
      } else if (messageType === messageAwareness) {
        // Decode and broadcast awareness
        const update = decoding.readVarUint8Array(decoder)
        awarenessProtocol.applyAwarenessUpdate(entry.awareness, update, ws)
        // Broadcast to all including sender
        const encodedAwareness = encoding.createEncoder()
        encoding.writeVarUint(encodedAwareness, messageAwareness)
        encoding.writeVarUint8Array(encodedAwareness, update)
        const awarenessMsg = encoding.toUint8Array(encodedAwareness)
        entry.conns.forEach((_, conn) => {
          if (conn !== ws) send(conn, awarenessMsg)
        })
      }
    } catch (e) {
      console.error('[ws] message error:', e)
    }
  })

  ws.on('close', () => {
    entry.conns.delete(ws)
    // Remove awareness for this client
    awarenessProtocol.removeAwarenessStates(entry.awareness, [entry.ydoc.clientID], null)
    // Clean up in-memory doc if no more connections
    if (entry.conns.size === 0) {
      docs.delete(docName)
    }
  })

  ws.on('error', (e) => {
    console.error('[ws] socket error:', e)
    entry.conns.delete(ws)
  })
})

server.listen(PORT, () => console.log(`✅ WS server with Supabase persistence running on port ${PORT}`))
