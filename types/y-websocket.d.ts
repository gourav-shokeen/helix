// types/y-websocket.d.ts — Minimal type declarations for y-websocket
declare module 'y-websocket' {
    import * as Y from 'yjs'

    export interface WebsocketProviderOptions {
        connect?: boolean
        awareness?: import('y-protocols/awareness').Awareness
        params?: Record<string, string>
        WebSocketPolyfill?: typeof WebSocket
        resyncInterval?: number
        maxBackoffTime?: number
        disableBc?: boolean
    }

    export class WebsocketProvider {
        constructor(
            serverUrl: string,
            roomname: string,
            doc: Y.Doc,
            options?: WebsocketProviderOptions
        )
        awareness: import('y-protocols/awareness').Awareness
        connect(): void
        disconnect(): void
        destroy(): void
        shouldConnect: boolean
        bcconnected: boolean
        synced: boolean
        ws: WebSocket | null
    }
}
