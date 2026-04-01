import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { setupWSConnection } from 'y-websocket/bin/utils.cjs'

const PORT = process.env.PORT || 1234
const server = createServer()
const wss = new WebSocketServer({ server })

wss.on('connection', (ws, req) => setupWSConnection(ws, req))
server.listen(PORT, () => console.log(`✅ y-websocket running on port ${PORT}`))