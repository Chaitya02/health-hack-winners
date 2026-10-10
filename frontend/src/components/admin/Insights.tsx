import { useEffect, useState } from 'react'
import { api, type Analytics, type StaffStats } from '../../lib/api'
import { DEPARTMENT_LABELS } from '../../types/ticket'
import { useNow } from '../../hooks/useNow'
import { ScheduleTimeline, scheduleWindow, TimeAxis } from '../staff/ScheduleTimeline'
import { STATUS_LABEL, STATUS_STYLE } from '../staff/StaffPanel'
import { Bars } from './Bars'

const RANGES = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
] as const

const SEVERITY_LABELS: Record<string, string> = {
  '5': '5 · Urgent clinical',
  '4': '4 · Raised (fall risk, waiting)',
  '3': '3 · Routine clinical',
  '2': '2 · Comfort, food, cleaning',
  '1': '1 · TV & tech',
}

const nf = new Intl.NumberFormat('en-US')
const plural = (n: number, one: string, many: string) => `${nf.format(n)} ${n === 1 ? one : many}`

function duration(v: number | null) {
  if (v == null) return '–'
  return v < 90 ? `${Math.round(v)} s` : `${(v / 60).toFixed(1)} min`
}

const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`

/** US-1 request insights: nurse/admin only. Refreshes every 10 s. */
export function Insights({ token }: { token: string }) {
  const [days, setDays] = useState<number>(1)
  const [a, setA] = useState<Analytics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = () =>
      api
        .analytics(token, days)
        .then((x) => alive && (setA(x), setError(null)))
        .catch(() => alive && setError('Cannot load insights right now.'))
    void load()
    const id = setInterval(load, 10_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [token, days])

  async function download() {
    try {
      const blob = await api.exportCsv(token, days)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `tingting-requests-${days}d.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('The CSV export failed. Try again.')
    }
  }

  const range = RANGES.find((r) => r.days === days)?.label ?? ''
  return (
    <section aria-labelledby="insights" className="space-y-6 rounded-3xl border-2 border-line bg-paper p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="insights" className="text-xl font-bold">
            Request insights
          </h2>
          <p className="text-sm text-pine-soft">Stored request data for nurses and admins. No patient words are exported.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Time range" className="flex rounded-xl border-2 border-line p-1">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                aria-pressed={days === r.days}
                onClick={() => setDays(r.days)}
                className={`min-h-10 rounded-lg px-3 text-sm font-bold ${days === r.days ? 'bg-pine text-white' : 'text-pine-soft hover:bg-curtain'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void download()}
            className="min-h-12 rounded-xl border-2 border-pine px-4 font-bold hover:bg-curtain"
          >
            Download CSV
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="font-bold text-bell">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Escalated to the nurse"
          value={a?.escalations.total}
          note={a ? `${a.escalations.by_patient_note} from patient notes · ${a.escalations.by_staff} by staff` : undefined}
          testid="insight-escalated"
        />
        <Tile label="Priority raised for fall risk" value={a?.fall_risk_priority} note={a ? `${plural(a.npo_reroutes, 'NPO food/drink request', 'NPO food/drink requests')} sent to the nurse` : undefined} />
        <Tile label="“Still waiting” taps" value={a?.nudges} note={a ? `on ${plural(a.nudged_requests, 'request', 'requests')} · ${plural(a.notes, 'note', 'notes')} added` : undefined} />
        <Tile label="Cancelled by patients" value={a?.cancelled} note={a ? `of ${plural(a.total, 'request', 'requests')} (${range.toLowerCase()})` : undefined} />
      </div>

      {a && a.staff.length > 0 && <StaffWorkload staff={a.staff} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="font-bold">Requests by hour of day</h3>
          <HourChart counts={a?.by_hour ?? Array(24).fill(0)} />
        </div>
        <div>
          <h3 className="font-bold">Requests by severity</h3>
          <Bars
            rows={['5', '4', '3', '2', '1'].map((s) => ({ label: SEVERITY_LABELS[s], value: a?.by_severity[s] ?? 0 }))}
            format={(v) => nf.format(v)}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="font-bold">Median response times</h3>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-pine-soft">
              <tr>
                <th className="py-1 font-normal">Department</th>
                <th className="py-1 text-right font-normal">Requests</th>
                <th className="py-1 text-right font-normal">To acknowledge</th>
                <th className="py-1 text-right font-normal">To resolve</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(a?.times ?? []).map((r) => (
                <tr key={r.department} className="border-t border-line">
                  <th scope="row" className="py-2 font-normal">
                    {DEPARTMENT_LABELS[r.department]}
                  </th>
                  <td className="py-2 text-right">{nf.format(r.requests)}</td>
                  <td className="py-2 text-right font-bold">{duration(r.median_ack_seconds)}</td>
                  <td className="py-2 text-right font-bold">{duration(r.median_resolve_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="font-bold">Busiest rooms</h3>
          {a && a.top_rooms.length === 0 ? (
            <p className="mt-3 text-sm text-pine-soft">No requests in this range yet.</p>
          ) : (
            <table className="mt-3 w-full text-left text-sm" data-testid="top-rooms">
              <thead className="text-pine-soft">
                <tr>
                  <th className="py-1 font-normal">Room</th>
                  <th className="py-1 text-right font-normal">Requests</th>
                  <th className="py-1 text-right font-normal">“Still waiting” taps</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {(a?.top_rooms ?? []).map((r) => (
                  <tr key={r.room_id} className="border-t border-line">
                    <th scope="row" className="py-2 font-bold">
                      {r.room_id}
                    </th>
                    <td className="py-2 text-right">{nf.format(r.requests)}</td>
                    <td className="py-2 text-right">{nf.format(r.nudges)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  )
}

function Tile({ label, value, note, testid }: { label: string; value: number | undefined; note?: string; testid?: string }) {
  return (
    <div className="rounded-2xl border-2 border-line p-4">
      <p className="text-sm text-pine-soft">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums" data-testid={testid}>
        {value == null ? '–' : nf.format(value)}
      </p>
      {note && <p className="mt-1 text-xs text-pine-soft">{note}</p>}
    </div>
  )
}

/** Single-series column chart (one hue, no legend): 2px gaps, 4px rounded tops on the baseline,
 * the busiest hour labelled directly, a tooltip per column, and a table view for screen readers. */
export function HourChart({ counts }: { counts: number[] }) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(...counts)
  const peak = max > 0 ? counts.indexOf(max) : -1
  const summary =
    peak >= 0 ? `Requests by hour. Busiest: ${hourLabel(peak)} with ${max}.` : 'Requests by hour. No requests yet.'
  return (
    <figure className="mt-3">
      <div className="relative h-40 border-b-2 border-line pt-6" role="img" aria-label={summary}>
        <div className="flex h-full items-end gap-[2px]">
          {counts.map((n, h) => (
            <div
              key={h}
              className="relative flex h-full flex-1 items-end"
              onMouseEnter={() => setActive(h)}
              onMouseLeave={() => setActive(null)}
              data-testid="hour-column"
            >
              {n > 0 && (
                <div
                  className={`w-full rounded-t-[4px] ${active === h ? 'bg-care-deep' : 'bg-care'}`}
                  style={{ height: `${(100 * n) / Math.max(1, max)}%` }}
                />
              )}
              {h === peak && active !== h && (
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-bold tabular-nums">{n}</span>
              )}
              {active === h && (
                <div
                  role="tooltip"
                  className={`absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg bg-pine px-2 py-1 text-xs text-white ${
                    h < 3 ? 'left-0' : h > 20 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                  }`}
                >
                  {hourLabel(h)}–{hourLabel((h + 1) % 24)}: {n} {n === 1 ? 'request' : 'requests'}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex text-xs text-pine-soft" aria-hidden="true">
        {counts.map((_, h) => (
          <span key={h} className="flex-1 text-center">
            {h % 6 === 0 ? hourLabel(h) : ''}
          </span>
        ))}
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-pine-soft">Show as table</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead className="text-pine-soft">
            <tr>
              <th className="font-normal">Hour</th>
              <th className="text-right font-normal">Requests</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((n, h) => (
              <tr key={h}>
                <td>{hourLabel(h)}</td>
                <td className="text-right">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

/** Staff on duty, by department: status now, workload, response time and today's schedule. */
function StaffWorkload({ staff }: { staff: StaffStats[] }) {
  const now = useNow(30_000)
  const window = scheduleWindow(staff.map((s) => s.schedule))
  const departments = [...new Set(staff.map((s) => s.department))]
  return (
    <section aria-labelledby="staff-workload" data-testid="staff-workload">
      <h3 id="staff-workload" className="font-bold">
        Staff on duty
      </h3>
      <p className="text-sm text-pine-soft">Requests go to whoever is available with the fewest open tasks.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="text-pine-soft">
            <tr>
              <th className="py-1 font-normal">Staff</th>
              <th className="py-1 font-normal">Now</th>
              <th className="py-1 text-right font-normal">Open</th>
              <th className="py-1 text-right font-normal">Done</th>
              <th className="py-1 text-right font-normal">Median to acknowledge</th>
              <th className="w-[40%] py-1 pl-6 font-normal">Today’s schedule</th>
            </tr>
          </thead>
          {departments.map((dept) => (
            <tbody key={dept} className="tabular-nums">
              <tr>
                <th colSpan={6} scope="colgroup" className="pt-3 text-xs uppercase tracking-wide text-pine-soft">
                  {DEPARTMENT_LABELS[dept]}
                </th>
              </tr>
              {staff
                .filter((s) => s.department === dept)
                .map((s) => (
                  <tr key={s.staff_id} className="border-t border-line">
                    <th scope="row" className="py-2 font-bold">
                      {s.name}
                    </th>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 font-bold ${STATUS_STYLE[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                    </td>
                    <td className="py-2 text-right font-bold">{nf.format(s.open_tasks)}</td>
                    <td className="py-2 text-right">{nf.format(s.resolved)}</td>
                    <td className="py-2 text-right">{duration(s.median_ack_seconds)}</td>
                    <td className="py-2 pl-6">
                      <ScheduleTimeline schedule={s.schedule} now={now} window={window} />
                    </td>
                  </tr>
                ))}
            </tbody>
          ))}
          <tfoot>
            <tr>
              <td colSpan={5} />
              <td className="pl-6">
                <TimeAxis window={window} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
