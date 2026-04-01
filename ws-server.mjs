import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import * as Y from 'yjs'

const PORT = process.env.PORT || 1234
const docs = new Map()

function getDoc(docName) {
  if (!docs.has(docName)) docs.set(docName, new Y.Doc())
  return docs.get(docName)
}

const server = createServer()
const wss = new WebSocketServer({ server })

wss.on('connection', (ws, req) => {
  const docName = req.url?.slice(1) || 'default'
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