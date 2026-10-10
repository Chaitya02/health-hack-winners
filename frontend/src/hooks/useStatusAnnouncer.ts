import { useEffect, useRef } from 'react'
import type { PatientTicketView, Status } from '../types/ticket'

/**
 * Calls `announce(request)` when an existing request's status changes (US-7). Requests that are
 * new to the screen are not announced: the confirmation already covered them, and the first
 * load must not read out the whole day's history.
 */
export function useStatusAnnouncer(
  requests: PatientTicketView[],
  enabled: boolean,
  announce: (r: PatientTicketView) => void,
) {
  const seen = useRef<Map<string, Status> | null>(null)
  const announceRef = useRef(announce)
  useEffect(() => {
    announceRef.current = announce
  })

  useEffect(() => {
    const prev = seen.current
    seen.current = new Map(requests.map((r) => [r.ticket_id, r.status]))
    if (!prev || !enabled) return
    for (const r of requests) {
      const before = prev.get(r.ticket_id)
      if (before !== undefined && before !== r.status) announceRef.current(r)
    }
  }, [requests, enabled])
}
