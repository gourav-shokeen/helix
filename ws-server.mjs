/**
 * ws-server.mjs — Helix WebSocket collaboration server
 *
 * Implements the full y-protocols sync + awareness protocol so that every new
 * joiner immediately gets a SyncStep2 (full document state) from the server,
 * regardless of what other clients are doing.
 *
 * Message types (y-websocket / y-protocols wire format):
 *   0 = sync message (SyncStep1 / SyncStep2 / Update)
 *   1 = awareness message
 *
 * Auth paths:
 *   ?user=<uuid>          next-auth authenticated user
 *   ?share_token=<tok>    guest with a valid edit-permission share link
 */
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

const PORT = process.env.PORT || 1234
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// ── In-memory document store ──────────────────────────────────────────────────
// Map<docName, { ydoc: Y.Doc, awareness: awarenessProtocol.Awareness, conns: Map<WebSocket, Set> }>
const rooms = new Map()

function getRoom(docName) {
  if (!rooms.has(docName)) {
    const ydoc = new Y.Doc()
    const awareness = new awarenessProtocol.Awareness(ydoc)
    awareness.setLocalState(null) // server has no local state
    rooms.set(docName, { ydoc, awareness, conns: new Map() })
  }
  return rooms.get(docName)
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function validateUserId(userId) {
  return typeof userId === 'string' && userId.length > 0
}

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
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null
    return { permission: row.permission, doc_id: row.doc_id }
  } catch {
    return null
  }
}

// ── Send helpers ──────────────────────────────────────────────────────────────
const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1

function sendSyncStep1(ws, ydoc) {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  syncProtocol.writeSyncStep1(encoder, ydoc)
  ws.send(encoding.toUint8Array(encoder))
}

function sendSyncStep2(ws, ydoc, encodedStateVector) {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  syncProtocol.writeSyncStep2(encoder, ydoc, encodedStateVector)
  ws.send(encoding.toUint8Array(encoder))
}

function broadcastUpdate(room, origin, update) {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  syncProtocol.writeUpdate(encoder, update)
  const msg = encoding.toUint8Array(encoder)
  room.conns.forEach((_, client) => {
    if (client !== origin && client.readyState === 1 /* OPEN */) {
      client.send(msg)
    }
  })
}

function broadcastAwareness(room, origin, msg) {
  room.conns.forEach((_, client) => {
    if (client !== origin && client.readyState === 1) {
      client.send(msg)
    }
  })
}

// ── Server ────────────────────────────────────────────────────────────────────
const server = createServer()
const wss = new WebSocketServer({ server })

wss.on('connection', async (ws, req) => {
  let userId = null
  let shareToken = null
  let docName = 'default'

  // Parse URL: y-websocket client connects as ws://host/<docId>?user=<id>
  try {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`)
    userId = url.searchParams.get('user')
    shareToken = url.searchParams.get('share_token')
    docName = url.pathname.slice(1) || 'default'
  } catch {
    // malformed — fall through, both null → rejected below
  }

  // ── Authenticate ────────────────────────────────────────────────────────────
  if (userId) {
    if (!validateUserId(userId)) {
      ws.close(4001, 'Unauthorized')
      return
    }
    console.log(`[ws] user ${userId} connected to doc "${docName}"`)
  } else if (shareToken) {
    const shareRow = await validateShareToken(shareToken)
    if (!shareRow) {
      ws.close(4001, 'Unauthorized')
      return
    }
    if (shareRow.permission === 'view') {
      ws.close(4003, 'ViewOnly')
      return
    }
    console.log(`[ws] share-token user connected to doc "${docName}"`)
  } else {
    ws.close(4001, 'Unauthorized')
    return
  }

  // ── Join room ───────────────────────────────────────────────────────────────
  const room = getRoom(docName)
  const { ydoc, awareness, conns } = room
  conns.set(ws, new Set())

  // Listen to local Y.Doc updates so we can broadcast them to peers
  // (updates that arrive from one client are applied to ydoc; we then broadcast
  // the same update to every other client in the room).
  const updateHandler = (update, origin) => {
    if (origin !== ws) {
      broadcastUpdate(room, ws, update)
    }
  }
  ydoc.on('update', updateHandler)

  // Listen to awareness changes from other clients and broadcast to everyone
  const awarenessHandler = ({ added, updated, removed }) => {
    const changedClients = added.concat(updated, removed)
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients))
    const msg = encoding.toUint8Array(encoder)
    broadcastAwareness(room, null, msg) // broadcast to ALL including sender (awareness echo is expected)
  }
  awareness.on('update', awarenessHandler)

  // ── Send initial state to new joiner ─────────────────────────────────────
  // SyncStep1: tell the client what state vector the server has.
  // The client will reply with SyncStep2 containing updates the server is missing,
  // and will also send us its own SyncStep1 so we reply with our SyncStep2.
  sendSyncStep1(ws, ydoc)

  // Also send current awareness of all connected clients
  const awarenessStates = awareness.getStates()
  if (awarenessStates.size > 0) {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awarenessStates.keys()))
    )
    ws.send(encoding.toUint8Array(encoder))
  }

  // ── Handle incoming messages ─────────────────────────────────────────────
  ws.on('message', (rawMsg) => {
    const message = new Uint8Array(rawMsg instanceof Buffer ? rawMsg : Buffer.from(rawMsg))
    try {
      const decoder = decoding.createDecoder(message)
      const msgType = decoding.readVarUint(decoder)

      if (msgType === MESSAGE_SYNC) {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, MESSAGE_SYNC)

        // readSyncMessage applies the update / answers step1 / applies step2
        // It writes a reply into encoder if one is needed (for SyncStep1 → replies SyncStep2).
        // We pass `ws` as the `transactionOrigin` so our `update` handler can
        // skip broadcasting back to the sender.
        const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, ydoc, ws)

        if (encoding.length(encoder) > 1) {
          ws.send(encoding.toUint8Array(encoder))
        }

        // After applying the client's SyncStep2 or Update, broadcast the update
        // to all other clients. The ydoc `update` handler (above) does this for
        // updates that didn't originate from `ws` (i.e., server-generated ones).
        // But for updates arriving FROM `ws`, the origin IS `ws`, so the update
        // handler skips them. We broadcast manually here for sync updates from clients.
        if (syncMessageType === syncProtocol.messageYjsSyncStep2 || syncMessageType === syncProtocol.messageYjsUpdate) {
          // Already applied to ydoc via readSyncMessage. Now broadcast raw bytes
          // to every other peer so they stay in sync.
          conns.forEach((_, client) => {
            if (client !== ws && client.readyState === 1) {
              client.send(message)
            }
          })
        }
      } else if (msgType === MESSAGE_AWARENESS) {
        // Apply awareness update and broadcast to peers
        awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), ws)
        broadcastAwareness(room, ws, message)
      }
    } catch (err) {
      console.error('[ws] message error:', err)
    }
  })

  // ── Cleanup ──────────────────────────────────────────────────────────────
  ws.on('close', () => {
    conns.delete(ws)
    ydoc.off('update', updateHandler)
    awareness.off('update', awarenessHandler)
    // Remove client's awareness state when they disconnect
    awarenessProtocol.removeAwarenessStates(awareness, [ydoc.clientID], 'connection closed')

    // If room is empty, clean it up to free memory (optional)
    if (conns.size === 0) {
      setTimeout(() => {
        // Double-check still empty after a brief delay to handle quick reconnects
        if (rooms.get(docName)?.conns?.size === 0) {
          const r = rooms.get(docName)
          if (r) {
            r.ydoc.destroy()
            r.awareness.destroy()
          }
          rooms.delete(docName)
          console.log(`[ws] room "${docName}" cleaned up (empty)`)
        }
      }, 30_000)
    }
  })

  ws.on('error', (err) => {
    console.error(`[ws] socket error on doc "${docName}":`, err.message)
    conns.delete(ws)
    ydoc.off('update', updateHandler)
    awareness.off('update', awarenessHandler)
  })
})

server.listen(PORT, () => console.log(`✅ Helix WS server running on port ${PORT} (Yjs sync protocol active)`))