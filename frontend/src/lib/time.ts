export function secondsSince(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
}

export function formatWait(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${m}:${String(s).padStart(2, '0')}`
}

export type Aging = 'fresh' | 'waiting' | 'late'

/** green < 5 min, amber < 10 min, red ≥ 10 min */
export function aging(seconds: number): Aging {
  if (seconds < 300) return 'fresh'
  if (seconds < 600) return 'waiting'
  return 'late'
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
