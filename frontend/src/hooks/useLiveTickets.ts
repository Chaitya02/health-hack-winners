import { useCallback, useEffect, useRef, useState } from 'react'
import { getConfig } from '../lib/config'
import { RealtimeClient, type RealtimeStatus } from '../lib/realtime'
import type { TicketEvent } from '../types/ticket'

export const POLL_MS = 2000

interface Options<T extends { ticket_id: string }> {
  fetcher: () => Promise<T[]>
  channels: string[]
  token?: string
  enabled?: boolean
  /** Map a realtime event to an upsert (T) or a removal (null). */
  fromEvent: (e: TicketEvent) => T | null
  onEvent?: (e: TicketEvent) => void
}

/** Initial fetch + live WebSocket updates; falls back to polling every 2 s while offline. */
export function useLiveTickets<T extends { ticket_id: string }>({
  fetcher,
  channels,
  token,
  enabled = true,
  fromEvent,
  onEvent,
}: Options<T>) {
  const [items, setItems] = useState<Map<string, T>>(new Map())
  const [status, setStatus] = useState<RealtimeStatus>('connecting')
  const [error, setError] = useState<string | null>(null)
  const fetcherRef = useRef(fetcher)
  const fromEventRef = useRef(fromEvent)
  const onEventRef = useRef(onEvent)
  useEffect(() => {
    fetcherRef.current = fetcher
    fromEventRef.current = fromEvent
    onEventRef.current = onEvent
  })

  // Events received while a snapshot is in flight are replayed on top of it, so a slow
  // refresh can never overwrite a newer realtime update.
  const recent = useRef<{ at: number; id: string; item: T | null }[]>([])

  const refresh = useCallback(async () => {
    const startedAt = performance.now()
    try {
      const rows = await fetcherRef.current()
      recent.current = recent.current.filter((e) => e.at >= startedAt)
      const next = new Map(rows.map((r) => [r.ticket_id, r]))
      for (const e of recent.current) {
        if (e.item) next.set(e.id, e.item)
        else next.delete(e.id)
      }
      setItems(next)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [])

  const channelKey = channels.join('|')
  useEffect(() => {
    if (!enabled) return
    void refresh()
    const client = new RealtimeClient({
      url: getConfig().wsUrl,
      channels: channelKey.split('|'),
      token,
      onStatus: (s) => {
        setStatus(s)
        if (s === 'live') void refresh() // catch up on anything missed while offline
      },
      onEvent: (e) => {
        onEventRef.current?.(e)
        const mapped = fromEventRef.current(e)
        recent.current.push({ at: performance.now(), id: e.ticket.ticket_id, item: mapped })
        if (recent.current.length > 500) recent.current.splice(0, 250)
        setItems((prev) => {
          const next = new Map(prev)
          if (mapped) next.set(mapped.ticket_id, mapped)
          else next.delete(e.ticket.ticket_id)
          return next
        })
      },
    })
    client.start()
    return () => client.stop()
  }, [channelKey, token, enabled, refresh])

  useEffect(() => {
    if (!enabled || status === 'live') return
    const id = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(id)
  }, [status, enabled, refresh])

  return { items: [...items.values()], status, error, refresh, setItems }
}
