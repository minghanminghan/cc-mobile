import http from 'http'
import express from 'express'
import path from 'path'
import { WebSocketServer, WebSocket } from 'ws'
import type { RawData } from 'ws'
import { Client, type ConnectConfig } from 'ssh2'
import type { ClientChannel } from 'ssh2'
import { SocksClient } from 'socks'
import { log } from './logger'
import crypto from 'crypto'
import dotenv from 'dotenv'
import webpush from 'web-push'
import { saveSub, removeSub, getAllSubs, touchSub } from './pushStore'

dotenv.config()

// -- Web Push / VAPID setup --------------------------------------------------
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT

const pushEnabled = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT)

if (pushEnabled) {
  webpush.setVapidDetails(VAPID_SUBJECT!, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!)
  log.debug('[push] Web Push enabled')
} else {
  log.debug('[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — server-side push disabled')
}

async function sendPushToAll(payload: object) {
  if (!pushEnabled) return
  const subs = getAllSubs()
  await Promise.allSettled(subs.map(async sub => {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload))
      touchSub(sub.endpoint)
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        removeSub(sub.endpoint)
      }
    }
  }))
}

// OSC patterns — mirrors Terminal.tsx signal parsing
const OSC_RE = /\x1b\](\d+);([^\x07]*)\x07/g
const DCS_RE = /\x1bPtmux;\x1b\x1b\](\d+);([^\x07]*)\x07\x1b\\/g

function extractSignals(text: string): { type: string; tool?: string; message?: string }[] {
  const signals: { type: string; tool?: string; message?: string }[] = []

  function handle(code: string, payload: string) {
    if (code === '9999') {
      try { signals.push(JSON.parse(payload)) } catch { /* malformed */ }
    } else if (code === '9') {
      signals.push({ type: 'stop', tool: 'codex', message: payload })
    }
  }

  for (const m of text.matchAll(OSC_RE)) handle(m[1], m[2])
  for (const m of text.matchAll(DCS_RE)) handle(m[1], m[2])
  return signals
}
// When stdout is piped (Docker / DigitalOcean) Node buffers output and log
// lines can disappear or arrive late. Force synchronous writes so every
// console.log flushes immediately.
if (process.stdout.isTTY === false) {
  const _write = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk: any, ...args: any[]) => {
    const result = _write(chunk, ...args)
    return result
  }
  // @ts-ignore — undocumented but reliable on all Node versions
  if (process.stdout._handle?.setBlocking) process.stdout._handle.setBlocking(true)
}

const PORT = parseInt(process.env.PORT ?? '3001', 10)

// Tailscale assigns IPs in the CGNAT range 100.64.0.0/10 (100.64.x.x – 100.127.x.x).
// With --tun=userspace-networking there is no kernel TUN device, so the OS has no
// route to 100.x.x.x addresses. Traffic must go through Tailscale's SOCKS5 proxy.
function isTailscaleIP(host: string): boolean {
  const parts = host.split('.').map(Number)
  return parts.length === 4 && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127
}

const WSS_AUTH_KEY = process.env.WSS_AUTH_KEY

if (!WSS_AUTH_KEY) {
  log.warn('\x1b[33m[warn] WSS_AUTH_KEY is not set in environment. WebSocket authentication is disabled. This is insecure.\x1b[0m')
}

interface ConnectMessage {
  type: 'connect'
  host: string
  port?: number
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

interface ResizeMessage {
  type: 'resize'
  cols: number
  rows: number
}

const app = express()

// Serve the compiled React frontend static files
const webDistPath = path.join(__dirname, '../../web/dist')
app.use(express.static(webDistPath))
app.use(express.json())

// Serve the install script for AI agent hook configuration
app.get('/install.sh', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain')
  res.sendFile(path.join(__dirname, '../../install.sh'))
})

// -- Push notification endpoints ---------------------------------------------

app.get('/vapid-public-key', (_req, res) => {
  if (!pushEnabled) { res.status(503).json({ error: 'push not configured' }); return }
  res.json({ publicKey: VAPID_PUBLIC_KEY })
})

app.post('/subscribe', (req, res) => {
  if (!pushEnabled) { res.status(503).json({ error: 'push not configured' }); return }
  const sub = req.body
  if (!sub?.endpoint) { res.status(400).json({ error: 'invalid subscription' }); return }
  saveSub(sub)
  log.debug(`[push] Subscription saved: ${sub.endpoint.slice(0, 60)}…`)
  res.status(201).json({ ok: true })
})

app.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body ?? {}
  if (endpoint) removeSub(endpoint)
  res.json({ ok: true })
})

// Catch-all route for SPA routing (returns index.html)
app.use((req, res, next) => {
  if (req.method === 'GET') {
    res.sendFile(path.join(webDistPath, 'index.html'))
  } else {
    next()
  }
})

const server = http.createServer(app)
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '', `http://${request.headers.host || 'localhost'}`)
  log.debug(`[upgrade] Request URL: ${request.url}`)

  // Enforce authentication if WSS_AUTH_KEY is set
  if (WSS_AUTH_KEY) {
    const timestamp = url.searchParams.get('timestamp')
    const hash = url.searchParams.get('hash')
    log.debug(`[auth] Timestamp: ${timestamp}, Hash: ${hash}`)

    if (!timestamp || !hash) {
      log.debug('[auth] Rejected connection: Missing authentication parameters')
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    const ts = parseInt(timestamp, 10)
    const now = Date.now()

    // Prevent replay attacks (allow 60 seconds drift max)
    if (isNaN(ts) || Math.abs(now - ts) > 60000) {
      log.debug(`[auth] Rejected connection: Timestamp expired or invalid (diff: ${Math.abs(now - ts)}ms)`)
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    // Verify HMAC
    const expectedHash = crypto.createHmac('sha256', WSS_AUTH_KEY).update(timestamp).digest('hex')

    // Use timingSafeEqual to prevent timing attacks
    const providedHashBuffer = Buffer.from(hash, 'hex')
    const expectedHashBuffer = Buffer.from(expectedHash, 'hex')

    if (providedHashBuffer.length !== expectedHashBuffer.length || !crypto.timingSafeEqual(providedHashBuffer, expectedHashBuffer)) {
      log.debug('[auth] Rejected connection: Invalid signature')
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
  }

  // Handle standard WebSocket upgrade
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

wss.on('connection', (ws: WebSocket) => {
  log.debug('[connection] New WebSocket connection')
  let ssh: Client | null = null
  let shell: ClientChannel | null = null

  // Buffer for messages arriving during handshake
  let pendingResize: ResizeMessage | null = null
  let pendingData: string[] = []

  function cleanup() {
    log.debug('[cleanup] Closing session')
    shell?.close()
    ssh?.end()
    shell = null
    ssh = null
    pendingResize = null
    pendingData = []
  }

  function sendError(message: string) {
    // log.debug(`[error] Sending error to client: ${message}`)
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', message }))
    }
  }

  ws.on('message', async (raw: RawData, isBinary: boolean) => {
    // 1. Shell is open — forward input or handle control messages
    if (shell) {
      if (!isBinary) {
        const text = raw.toString()
        try {
          const msg = JSON.parse(text)
          if (msg.type === 'resize') {
            const resizeMsg = msg as ResizeMessage
            if (typeof resizeMsg.rows === 'number' && typeof resizeMsg.cols === 'number') {
              shell.setWindow(resizeMsg.rows, resizeMsg.cols, 0, 0)
              return
            }
          }
        } catch {
          // Not JSON — raw terminal input
        }
        shell.write(text)
      } else {
        shell.write(raw as Buffer)
      }
      return
    }

    // 2. Connecting phase (SSH initialized but shell not ready)
    if (ssh) {
      if (!isBinary) {
        const text = raw.toString()
        try {
          const msg = JSON.parse(text)
          if (msg.type === 'resize') {
            log.debug('[buffering] Buffering resize message during handshake')
            pendingResize = msg as ResizeMessage
            return
          }
        } catch {
          // Raw text input
        }
        log.debug('[buffering] Buffering input data during handshake')
        pendingData.push(text)
      } else {
        // Binary input? ignoring for now or buffer as buffer?
        // Simplification: just ignoring binary input during handshake
      }
      return
    }

    // 3. No shell yet — expect the connect message
    let msg: ConnectMessage
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      ws.close(1008, 'expected JSON connect message')
      return
    }

    if (msg.type !== 'connect') {
      ws.close(1008, 'expected connect message')
      return
    }

    log.debug(`[connect] Connecting to ${msg.username}@${msg.host}:${msg.port ?? 22}`)

    ssh = new Client()

    ssh.on('ready', () => {
      log.debug('[ssh] Authentication successful')

      startShell()

      function startShell() {
        const rows = pendingResize?.rows ?? 24
        const cols = pendingResize?.cols ?? 80
        const term = 'xterm-256color'

        log.debug(`[ssh] Starting shell with size ${cols}x${rows}`)

        const onShellReady = (err: Error | undefined, stream: ClientChannel) => {
          if (err) {
            sendError(err.message)
            ws.close()
            return
          }

          shell = stream
          log.debug('[ssh] Shell started')

          // Flush pending data
          if (pendingData.length > 0) {
            log.debug(`[ssh] Flushing ${pendingData.length} buffered input chunks`)
            pendingData.forEach(chunk => stream.write(chunk))
            pendingData = []
          }

          // If we had a buffered resize that might be different from initial pty alloc (unlikely if we used it above, but good practice)
          if (pendingResize) {
            stream.setWindow(pendingResize.rows, pendingResize.cols, 0, 0)
            pendingResize = null
          }

          stream.on('data', (chunk: Buffer) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(chunk)
            // Detect OSC signals and deliver server-side push when the
            // browser tab may be backgrounded or closed.
            const text = chunk.toString('utf8')
            const signals = extractSignals(text)
            for (const signal of signals) {
              const isStop = signal.type === 'stop'
              const toolLabel = signal.tool ? ` · ${signal.tool}` : ''
              const title = isStop ? `Task complete${toolLabel}` : `Notification${toolLabel}`
              const body  = isStop ? '' : (signal.message ?? '')
              sendPushToAll({ title, body, tag: signal.type }).catch(() => {})
            }
          })

          stream.stderr.on('data', (chunk: Buffer) => {
            log.debug(`[ssh] stderr: ${chunk.toString()}`)
            if (ws.readyState === WebSocket.OPEN) ws.send(chunk)
          })

          stream.on('close', () => {
            log.debug('[ssh] Shell closed')
            ws.close()
          })
        }

        // Validate session name: only letters, digits, dash, underscore
        const rawName = msg.sessionName ?? 'mobile-terminal'
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(rawName)) {
          sendError(`Invalid tmux session name: "${rawName}". Only letters, digits, - and _ are allowed.`)
          ws.close()
          return
        }
        const sessionName = rawName
        const newSessionFlags = [
          msg.tmuxAttachIfExists !== false ? '-A' : '',
          msg.tmuxDetachOthers !== false ? '-D' : '',
        ].filter(Boolean).join(' ')
        const setOpts = [
          msg.tmuxMouseMode !== false ? 'set -g mouse on' : '',
          msg.tmuxAllowPassthrough !== false ? 'set -g allow-passthrough on' : '',
        ].filter(Boolean)
        const setClause = setOpts.length ? ' \\; ' + setOpts.join(' \\; ') : ''
        let cmd = msg.projectPath
          ? `tmux new-session ${newSessionFlags} -t . -c "${msg.projectPath}" -s ${sessionName}${setClause}`
          : `tmux new-session ${newSessionFlags} -s ${sessionName}${setClause}`

        log.debug(`[ssh] Spawning command: ${cmd}`)
        ssh!.exec(cmd, { pty: { term, rows, cols } }, onShellReady as any) // exec with pty
      }
    })

    ssh.on('error', (err) => {
      const isTailscale = isTailscaleIP(msg.host)
      const usingSocks5 = !!process.env.TAILSCALE_SOCKS5

      let detail = err.message
      if (err.message.includes('Timed out while waiting for handshake')) {
        if (isTailscale && !usingSocks5) {
          detail = `SSH handshake timed out. Target is a Tailscale IP (${msg.host}) but TAILSCALE_SOCKS5 is not set — the relay has no route to this address. Ensure Tailscale is running natively on the relay machine, or set TAILSCALE_SOCKS5 if running in Docker.`
        } else if (isTailscale && usingSocks5) {
          detail = `SSH handshake timed out via SOCKS5. The SOCKS5 tunnel connected but the SSH server at ${msg.host}:${msg.port ?? 22} did not respond — check that sshd is running on the target and that Tailscale ACLs allow port ${msg.port ?? 22}.`
        } else {
          detail = `SSH handshake timed out connecting to ${msg.host}:${msg.port ?? 22} — check that the host is reachable and sshd is running.`
        }
      } else if (err.message.includes('All configured authentication methods failed')) {
        detail = `Authentication failed for ${msg.username}@${msg.host} — check your password or private key.`
      } else if (err.message.includes('ECONNREFUSED')) {
        detail = `Connection refused at ${msg.host}:${msg.port ?? 22} — sshd may not be running on that port.`
      } else if (err.message.includes('ENOTFOUND') || err.message.includes('ENOENT')) {
        detail = `Host not found: ${msg.host} — check the hostname or IP address.`
      }

      log.debug(`[ssh] Error: ${err.message}`)
      // log.debug(`[ssh] Diagnostic: ${detail}`)
      sendError(detail)
      ws.close()
    })

    const config: ConnectConfig = {
      host: msg.host,
      port: msg.port ?? 22,
      username: msg.username,
      // TODO: proper host key verification post-MVP
      hostVerifier: () => true,
    }
    if (msg.password) config.password = msg.password
    if (msg.privateKey) config.privateKey = msg.privateKey

    // If TAILSCALE_SOCKS5 is set, route Tailscale IPs through the local SOCKS5 proxy.
    // Required when running in Docker with userspace networking (no kernel TUN device).
    // When Tailscale is installed natively on the relay machine, leave this unset and
    // the OS kernel routes 100.x.x.x addresses directly.
    const socks5Addr = process.env.TAILSCALE_SOCKS5
    if (isTailscaleIP(msg.host)) {
      if (socks5Addr) {
        const [proxyHost, proxyPortStr] = socks5Addr.split(':')
        const proxyPort = parseInt(proxyPortStr ?? '1055', 10)
        log.debug(`[socks5] Tailscale IP detected — connecting via SOCKS5 proxy at ${socks5Addr}`)
        try {
          const { socket } = await SocksClient.createConnection({
            proxy: { host: proxyHost, port: proxyPort, type: 5 },
            command: 'connect',
            destination: { host: msg.host, port: msg.port ?? 22 },
          })
          config.sock = socket
          log.debug(`[socks5] SOCKS5 tunnel established to ${msg.host}:${msg.port ?? 22}`)
        } catch (err: any) {
          log.debug(`[socks5] SOCKS5 connection failed: ${err.message}`)
          sendError(`Tailscale SOCKS5 unavailable — is Tailscale running? (${err.message})`)
          ws.close()
          return
        }
      } else {
        log.debug(`[connect] Tailscale IP detected — TAILSCALE_SOCKS5 not set, attempting direct connection (requires native Tailscale on this machine)`)
      }
    }

    log.debug(`[ssh] Initiating SSH handshake to ${msg.host}:${msg.port ?? 22} (auth: ${msg.password ? 'password' : 'key'})`)
    ssh.connect(config)
  })

  ws.on('close', () => {
    log.debug('[ws] Client disconnected')
    cleanup()
  })
  ws.on('error', (err) => {
    log.debug(`[ws] Error: ${err.message}`)
    cleanup()
  })
})

server.listen(PORT, () => {
  log.debug(`Relay listening on ws://localhost:${PORT}`)
})
