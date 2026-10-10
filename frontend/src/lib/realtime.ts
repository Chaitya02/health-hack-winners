// Transport-agnostic realtime client. Same protocol for the local FastAPI /ws endpoint and the
// AWS API Gateway WebSocket API: connect, send {action:"subscribe", channels, token}, receive
// ticket events. Reconnects with backoff; callers poll while status !== 'live'.

import type { TicketEvent } from '../types/ticket'

export type RealtimeStatus = 'connecting' | 'live' | 'offline'

export interface RealtimeOptions {
  url: string
  channels: string[]
  token?: string
  onEvent: (e: TicketEvent) => void
  onStatus: (s: RealtimeStatus) => void
}

const MAX_BACKOFF_MS = 10_000
const PING_MS = 25_000

export class RealtimeClient {
  private ws: WebSocket | null = null
  private stopped = false
  private attempt = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private pingTimer: ReturnType<typeof setInterval> | undefined
  private opts: RealtimeOptions

  constructor(opts: RealtimeOptions) {
    this.opts = opts
  }

  start() {
    this.stopped = false
    this.connect()
  }

  stop() {
    this.stopped = true
    clearTimeout(this.retryTimer)
    clearInterval(this.pingTimer)
    this.ws?.close()
    this.ws = null
  }

  private connect() {
    this.opts.onStatus('connecting')
    let ws: WebSocket
    try {
      ws = new WebSocket(this.opts.url)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = ws
    ws.onopen = () => {
      ws.send(
        JSON.stringify({ action: 'subscribe', channels: this.opts.channels, token: this.opts.token }),
      )
      clearInterval(this.pingTimer)
      this.pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: 'ping' }))
      }, PING_MS)
    }
    ws.onmessage = (msg) => {
      let data: { type?: string }
      try {
        data = JSON.parse(String(msg.data))
      } catch {
        return
      }
      if (data.type === 'subscribed') {
        this.attempt = 0
        this.opts.onStatus('live')
      } else if (data.type?.startsWith('ticket.')) {
        this.opts.onEvent(data as TicketEvent)
      }
    }
    ws.onerror = () => ws.close()
    ws.onclose = () => {
      clearInterval(this.pingTimer)
      if (this.ws === ws) this.ws = null
      if (!this.stopped) this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    this.opts.onStatus('offline')
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt)
    this.attempt += 1
    clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => this.connect(), delay)
  }
}
