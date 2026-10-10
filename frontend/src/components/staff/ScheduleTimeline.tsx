import type { ScheduleBlock } from '../../types/ticket'

const time = (iso: string | number) =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

/**
 * Today's shift as a bar: the shift in teal, breaks as amber stripes, and a "now" line.
 * `window` lets several people share one time axis (the department's earliest start to latest end).
 */
export function ScheduleTimeline({
  schedule,
  now,
  window,
}: {
  schedule: ScheduleBlock[]
  now: number
  window: { start: number; end: number }
}) {
  const span = Math.max(1, window.end - window.start)
  const pct = (t: number) => `${Math.min(100, Math.max(0, ((t - window.start) / span) * 100))}%`
  const width = (a: number, b: number) => `${Math.max(0, ((Math.min(b, window.end) - Math.max(a, window.start)) / span) * 100)}%`
  const shifts = schedule.filter((b) => b.kind === 'shift')
  const breaks = schedule.filter((b) => b.kind === 'break').sort((a, b) => a.start.localeCompare(b.start))
  const summary = [
    ...shifts.map((s) => `Shift ${time(s.start)}–${time(s.end)}`),
    breaks.length ? `breaks ${breaks.map((b) => `${time(b.start)}–${time(b.end)}`).join(', ')}` : 'no breaks',
  ].join('; ')

  return (
    <div>
      <div className="relative h-5 rounded-full bg-curtain-deep" role="img" aria-label={summary} data-testid="schedule-bar">
        {shifts.map((s) => (
          <span
            key={s.start}
            className="absolute inset-y-0 rounded-full bg-care/80"
            style={{ left: pct(Date.parse(s.start)), width: width(Date.parse(s.start), Date.parse(s.end)) }}
          />
        ))}
        {breaks.map((b) => (
          <span
            key={b.start}
            title={`Break ${time(b.start)}–${time(b.end)}`}
            className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,var(--color-wait)_0_4px,var(--color-wait-tint)_4px_8px)]"
            style={{ left: pct(Date.parse(b.start)), width: width(Date.parse(b.start), Date.parse(b.end)) }}
          />
        ))}
        {now >= window.start && now <= window.end && (
          <span aria-hidden="true" className="absolute -inset-y-1 w-0.5 rounded bg-bell" style={{ left: pct(now) }} data-testid="now-marker" />
        )}
      </div>
    </div>
  )
}

/** Hour labels (every 3 h) under a group of timelines sharing `window`. */
export function TimeAxis({ window }: { window: { start: number; end: number } }) {
  const span = Math.max(1, window.end - window.start)
  const ticks: number[] = []
  const first = new Date(window.start)
  first.setMinutes(0, 0, 0)
  for (let t = first.getTime(); t <= window.end; t += 3 * 3600_000) if (t >= window.start) ticks.push(t)
  return (
    <div className="relative mt-1 h-4 text-xs text-pine-soft" aria-hidden="true">
      {ticks.map((t) => {
        const at = ((t - window.start) / span) * 100
        // Labels at the ends align inwards so they never spill past the bar.
        const align = at < 8 ? '' : at > 92 ? '-translate-x-full' : '-translate-x-1/2'
        return (
          <span key={t} className={`absolute whitespace-nowrap tabular-nums ${align}`} style={{ left: `${at}%` }}>
            {time(t)}
          </span>
        )
      })}
    </div>
  )
}

/** Shared time axis for a group of schedules. */
export function scheduleWindow(schedules: ScheduleBlock[][]): { start: number; end: number } {
  const all = schedules.flat().filter((b) => b.kind === 'shift')
  if (all.length === 0) return { start: Date.now() - 6 * 3600_000, end: Date.now() + 6 * 3600_000 }
  return { start: Math.min(...all.map((b) => Date.parse(b.start))), end: Math.max(...all.map((b) => Date.parse(b.end))) }
}
