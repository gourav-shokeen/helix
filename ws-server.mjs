/**
 * ws-server.mjs — Helix WebSocket collaboration server
 *
 * Persistence: every Yjs update is written to Supabase `document_updates` (bytea).
 * On cold start (first connection to a doc), all rows are loaded and applied to
 * an in-memory Y.Doc before the first SyncStep1 is sent, so joiners always get
 * the full historical content — even after a Railway restart.
 *
 * Compaction: after 50 persisted updates the doc is snapshot-compacted into a
 * single row to keep the table lean.
 *
 * Message types (y-protocols wire format):
 *   0 = sync    (SyncStep1 / SyncStep2 / Update)
 *   1 = awareness
 *
 * Auth:
 *   ?user=<uuid>          next-auth authenticated user
 *   ?share_token=<tok>    guest with a valid edit-permission share link
 */

import { createServer }           from 'http'
import { WebSocketServer }         from 'ws'
import { createClient }            from '@supabase/supabase-js'
import * as Y                      from 'yjs'
import * as syncProtocol           from 'y-protocols/sync'
import * as awarenessProtocol      from 'y-protocols/awareness'
import * as encoding               from 'lib0/encoding'
import * as decoding               from 'lib0/decoding'

// ── Config ────────────────────────────────────────────────────────────────────
const PORT                   = process.env.PORT                   || 1234
const SUPABASE_URL           = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// Service-role client — bypasses RLS, safe to use server-side only
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ── In-memory room store ──────────────────────────────────────────────────────
// Map<docName, {
//   ydoc:       Y.Doc
//   awareness:  Awareness
//   conns:      Map<WebSocket, Set>
//   updateCount: number          — persisted updates since last compact
//   loading:    boolean          — true while hydrating from DB (skip persist)
// }>
const rooms = new Map()

// ── Supabase persistence ──────────────────────────────────────────────────────
// update_data column type = bytea.
// Supabase JS sends bytea as Buffer. We read it back as a Buffer / Uint8Array.

async function loadUpdatesFromDB(docName, ydoc) {
  const { data, error } = await supabase
    .from('document_updates')
    .select('update_data')
    .eq('document_id', docName)
    .order('created_at', { ascending: true })

  if (error) {
    console.error(`[ws] DB load error for ${docName}:`, error.message)
    return 0
  }

  if (!data?.length) return 0

  for (const row of data) {
    // Supabase returns bytea as a Buffer in Node
    const buf = row.update_data
    const uint8 = buf instanceof Uint8Array ? buf : Buffer.isBuffer(buf) ? new Uint8Array(buf) : new Uint8Array(Buffer.from(buf))
    try {
      Y.applyUpdate(ydoc, uint8)
    } catch (e) {
      console.error(`[ws] corrupt update row for ${docName}:`, e.message)
    }
  }

  console.log(`[ws] loaded ${data.length} update(s) for doc "${docName}"`)
  return data.length
}

async function persistUpdate(docName, update) {
  // update is Uint8Array — store as bytea (Buffer)
  const { error } = await supabase
    .from('document_updates')
    .insert({ document_id: docName, update_data: Buffer.from(update) })

  if (error) {
    console.error(`[ws] persist error for ${docName}:`, error.message)
  }
}

async function compactDoc(docName, ydoc) {
  // Encode the entire current state as a single update
  const snapshot = Y.encodeStateAsUpdate(ydoc)

  // Delete all existing rows then insert the snapshot
  const { error: delErr } = await supabase
    .from('document_updates')
    .delete()
    .eq('document_id', docName)

  if (delErr) {
    console.error(`[ws] compact delete error for ${docName}:`, delErr.message)
    return
  }

  const { error: insErr } = await supabase
    .from('document_updates')
    .insert({ document_id: docName, update_data: Buffer.from(snapshot) })

  if (insErr) {
    console.error(`[ws] compact insert error for ${docName}:`, insErr.message)
    return
  }

  console.log(`[ws] compacted "${docName}" → 1 row`)
}

// ── Room initialisation (async — loads from DB on first access) ───────────────
async function getOrCreateRoom(docName) {
  if (rooms.has(docName)) return rooms.get(docName)

  const ydoc      = new Y.Doc()
  const awareness = new awarenessProtocol.Awareness(ydoc)
  awareness.setLocalState(null)

  const room = { ydoc, awareness, conns: new Map(), updateCount: 0, loading: true }
  rooms.set(docName, room)

  // Hydrate from DB before accepting connections
  await loadUpdatesFromDB(docName, ydoc)
  room.loading = false

  // Persist every future update that isn't part of the initial load
  ydoc.on('update', async (update, origin) => {
    if (room.loading) return          // don't persist updates applied during load
    if (origin === 'persistence') return // avoid double-write from our own compact

    await persistUpdate(docName, update)
    room.updateCount++

    if (room.updateCount % 50 === 0) {
      await compactDoc(docName, ydoc)
      room.updateCount = 0
    }
  })

  return room
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function validateUserId(userId) {
  return typeof userId === 'string' && userId.length > 0
}

async function validateShareToken(shareToken) {
  if (!shareToken) return null
  try {
    const { data: rows } = await supabase
      .from('share_links')
      .select('permission, expires_at, doc_id')
      .eq('token', shareToken)
      .limit(1)

    if (!rows?.length) return null
    const row = rows[0]
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null
    return { permission: row.permission, doc_id: row.doc_id }
  } catch {
    return null
  }
}

// ── Message helpers ───────────────────────────────────────────────────────────
const MESSAGE_SYNC      = 0
const MESSAGE_AWARENESS = 1

function sendSyncStep1(ws, ydoc) {
  const enc = encoding.createEncoder()
  encoding.writeVarUint(enc, MESSAGE_SYNC)
  syncProtocol.writeSyncStep1(enc, ydoc)
  ws.send(encoding.toUint8Array(enc))
}

function broadcastAwareness(room, origin, msg) {
  room.conns.forEach((_, client) => {
    if (client !== origin && client.readyState === 1) client.send(msg)
  })
}

// ── WebSocket server ──────────────────────────────────────────────────────────
const server = createServer()
const wss    = new WebSocketServer({ server })

wss.on('connection', async (ws, req) => {
  let userId     = null
  let shareToken = null
  let docName    = 'default'

  // y-websocket URL format: ws://host/<docId>?user=<id>
  try {
    const url  = new URL(req.url || '/', `http://localhost:${PORT}`)
    userId     = url.searchParams.get('user')
    shareToken = url.searchParams.get('share_token')
    docName    = url.pathname.slice(1) || 'default'
  } catch { /* malformed — fall through, both null → rejected */ }

  // ── Authenticate ────────────────────────────────────────────────────────────
  if (userId) {
    if (!validateUserId(userId)) { ws.close(4001, 'Unauthorized'); return }
    console.log(`[ws] user ${userId} → doc "${docName}"`)
  } else if (shareToken) {
    const shareRow = await validateShareToken(shareToken)
    if (!shareRow)                      { ws.close(4001, 'Unauthorized'); return }
    if (shareRow.permission === 'view') { ws.close(4003, 'ViewOnly');     return }
    console.log(`[ws] share-token user → doc "${docName}"`)
  } else {
    ws.close(4001, 'Unauthorized')
    return
  }

  // ── Join room (loads persisted state on first access) ───────────────────────
  const room = await getOrCreateRoom(docName)
  const { ydoc, awareness, conns } = room
  conns.set(ws, new Set())

  // Per-connection update handler — broadcasts to peers only
  // (not back to sender, not re-persisted — the room-level handler does that)
  const updateHandler = (_update, origin) => {
    if (origin === ws) {
      // Update came from this client; already applied to ydoc by readSyncMessage.
      // Broadcast the raw message bytes to every other peer.
      // (The room-level ydoc.on('update') persists it to DB.)
    }
    // NOTE: broadcasting is done in the message handler below after readSyncMessage;
    // this handler is for non-ws-origin updates (e.g., future server-driven changes).
  }
  ydoc.on('update', updateHandler)

  // Per-connection awareness handler — broadcasts awareness to everyone
  const awarenessChangeHandler = ({ added, updated, removed }) => {
    const changedClients = [...added, ...updated, ...removed]
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients))
    const msg = encoding.toUint8Array(enc)
    // Echo to ALL connections (awareness doesn't filter out sender — expected behaviour)
    conns.forEach((_, client) => { if (client.readyState === 1) client.send(msg) })
  }
  awareness.on('update', awarenessChangeHandler)

  // ── Send initial state to new joiner ────────────────────────────────────────
  // After DB hydration the server's ydoc has the full historical state.
  // SyncStep1 triggers the client to send SyncStep2 with any local changes,
  // and to request a SyncStep2 from us (which readSyncMessage will generate).
  sendSyncStep1(ws, ydoc)

  // Send current awareness snapshot
  const awarenessStates = awareness.getStates()
  if (awarenessStates.size > 0) {
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, [...awarenessStates.keys()]))
    ws.send(encoding.toUint8Array(enc))
  }

  // ── Handle incoming messages ─────────────────────────────────────────────
  ws.on('message', (rawMsg) => {
    const message = new Uint8Array(rawMsg instanceof Buffer ? rawMsg : Buffer.from(rawMsg))
    try {
      const decoder = decoding.createDecoder(message)
      const msgType = decoding.readVarUint(decoder)

      if (msgType === MESSAGE_SYNC) {
        const enc = encoding.createEncoder()
        encoding.writeVarUint(enc, MESSAGE_SYNC)

        // Applies update / generates SyncStep2 reply / etc.
        // Origin = ws so the room-level persist handler can still see origin accurately.
        const syncType = syncProtocol.readSyncMessage(decoder, enc, ydoc, ws)

        // Send SyncStep2 reply back to this client if the encoder has content
        if (encoding.length(enc) > 1) ws.send(encoding.toUint8Array(enc))

        // Broadcast the raw message to all other peers in the room
        if (syncType === syncProtocol.messageYjsSyncStep2 || syncType === syncProtocol.messageYjsUpdate) {
          conns.forEach((_, client) => {
            if (client !== ws && client.readyState === 1) client.send(message)
          })
        }
      } else if (msgType === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), ws)
        broadcastAwareness(room, ws, message)
      }
    } catch (err) {
      console.error(`[ws] message error on "${docName}":`, err.message)
    }
  })

  // ── Cleanup ──────────────────────────────────────────────────────────────
  const cleanup = () => {
    conns.delete(ws)
    ydoc.off('update', updateHandler)
    awareness.off('update', awarenessChangeHandler)

    // Evict room from memory after 30 s if no connections remain,
    // so the next joiner re-hydrates from DB (Railway restart scenario).
    if (conns.size === 0) {
      setTimeout(() => {
        if (rooms.get(docName)?.conns?.size === 0) {
          const r = rooms.get(docName)
          if (r) { r.ydoc.destroy(); r.awareness.destroy() }
          rooms.delete(docName)
          console.log(`[ws] room "${docName}" evicted (empty)`)
        }
      }, 30_000)
    }
  }

  ws.on('close', cleanup)
  ws.on('error', (err) => {
    console.error(`[ws] socket error on "${docName}":`, err.message)
    cleanup()
  })
})

server.listen(PORT, () =>
  console.log(`✅ Helix WS server on port ${PORT} — Yjs sync + Supabase persistence active`)
)