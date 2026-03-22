import { createServer } from 'http'
import { WebSocketServer } from 'ws'

const ywsPath = new URL('./node_modules/y-websocket/bin/utils.cjs', import.meta.url)
const { setupWSConnection } = await import(ywsPath.href)

const PORT = process.env.PORT || 1234
const server = createServer()
const wss = new WebSocketServer({ server })

wss.on('connection', (ws, req) => setupWSConnection(ws, req))
server.listen(PORT, () => console.log(`✅ y-websocket running on port ${PORT}`))