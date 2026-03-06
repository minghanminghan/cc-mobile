import { log } from './logger'

export interface Credentials {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  projectPath?: string
  sessionName?: string
  tmuxAttachIfExists?: boolean
  tmuxDetachOthers?: boolean
  tmuxMouseMode?: boolean
  tmuxAllowPassthrough?: boolean
}

export interface HostKeyPrompt {
  host: string
  fingerprint: string
  keyType: string
  keyB64: string
}

export interface RelayClient {
  sendData(data: string | Uint8Array): void
  resize(cols: number, rows: number): void
  sendHostKeyResponse(accept: boolean, host: string, keyData?: string): void
  disconnect(): void
}

export function connect(
  credentials: Credentials,
  onData: (chunk: Uint8Array) => void,
  onClose: (reason?: string) => void,
  onHostKeyVerification?: (prompt: HostKeyPrompt) => void
): RelayClient {
  let ws: WebSocket | null = null
  let pendingResize: { cols: number, rows: number } | null = null
  let closed = false

  const client: RelayClient = {
    sendData(data) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(data)
    },
    resize(cols, rows) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }))
      } else if (!ws || ws.readyState === WebSocket.CONNECTING) {
        pendingResize = { cols, rows }
      }
    },
    sendHostKeyResponse(accept, host, keyData) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'host-key-response', accept, host, keyData }))
      }
    },
    disconnect() {
      log.debug('[relayClient] Disconnecting WebSocket')
      closed = true
      if (ws) {
        ws.onclose = null
        ws.onerror = null
        ws.onmessage = null
        ws.onopen = null
        ws.close()
      }
    }
  }

  function closeOnce(reason?: string) {
    if (closed) return
    log.debug(`[relayClient] Connection closed${reason ? `: ${reason}` : ''}`)
    closed = true
    onClose(reason)
  }

  async function establishConnection() {
    log.debug('[relayClient] Establishing connection...')
    const authKey = import.meta.env.VITE_WSS_AUTH_KEY as string | undefined
    if (!authKey) {
      log.error('[relayClient] VITE_WSS_AUTH_KEY is not set in environment. WebSocket authentication is disabled. This is insecure.')
      return
    }

    log.debug('[relayClient] Generating HMAC signature for authentication')
    const timestamp = Date.now().toString()
    const encoder = new TextEncoder()
    const keyData = encoder.encode(authKey)
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(timestamp))
    const hash = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('')

    // Auto-detect secure wss based on environment flag or protocol
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const wsHost = import.meta.env.VITE_ENVIRONMENT === 'dev'
      ? 'localhost:3001'      // dev: Vite (:5173) and relay (:3001) are separate processes   
      : window.location.host  // prod: relay serves the web app, host is always correct       
    const RELAY_URL = `${wsProtocol}://${wsHost}?timestamp=${timestamp}&hash=${hash}`


    log.debug(`[relayClient] Connecting to Relay WebSocket at ${RELAY_URL.split('?')[0]}`)

    if (closed) return

    ws = new WebSocket(RELAY_URL)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      log.debug('[relayClient] WebSocket connected, sending credentials payload')
      ws!.send(JSON.stringify({ type: 'connect', ...credentials }))
      if (pendingResize) {
        log.debug('[relayClient] Sending buffered resize event')
        ws!.send(JSON.stringify({ type: 'resize', cols: pendingResize.cols, rows: pendingResize.rows }))
        pendingResize = null
      }
    }

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        onData(new Uint8Array(event.data))
      } else {
        try {
          const msg = JSON.parse(event.data as string) as any
          if (msg.type === 'error') {
            log.error(`[relayClient] Received error from relay: ${msg.message}`)
            closeOnce(msg.message)
          } else if (msg.type === 'host-key-verification' && onHostKeyVerification) {
            log.debug(`[relayClient] Prompting for unknown host key verification for ${msg.host}`)
            onHostKeyVerification({
              host: msg.host,
              fingerprint: msg.fingerprint,
              keyType: msg.keyType,
              keyB64: msg.keyB64
            })
          }
        } catch {
          // ignore unexpected text frames
        }
      }
    }

    ws.onclose = (event) => {
      log.debug(`[relayClient] WebSocket closed (code: ${event.code}, reason: ${event.reason})`)
      closeOnce(event.reason || undefined)
    }

    ws.onerror = () => {
      log.error('[relayClient] WebSocket connection error occurred')
      closeOnce('Connection error')
    }
  }

  establishConnection().catch(err => closeOnce('Failed to initialize connection: ' + err.message))

  return client
}

