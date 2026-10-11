import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveTickets } from '../hooks/useLiveTickets'
import { useNow } from '../hooks/useNow'
import { playAlert, unlockAudio } from '../lib/alertSound'
import { api, ApiError } from '../lib/api'
import { autoSignIn, demoPins } from '../lib/config'
import { aging, formatWait, secondsSince, type Aging } from '../lib/time'
import { StaffPanel } from '../components/staff/StaffPanel'
import { ChevronDownIcon, PersonIcon, PinIcon } from '../components/icons'
import { TileGlyph } from '../components/tileIcons'
import {
  CLOSED_STATUSES,
  DEPARTMENT_LABELS,
  DEPARTMENTS,
  type Department,
  type StaffStatus,
  type StaffView,
  type Ticket,
  type TicketAction,
  type TicketEvent,
} from '../types/ticket'

const tokenKey = (d: Department) => `tingting.staff.${d}`

function readToken(d: Department): string | null {
  try {
    return sessionStorage.getItem(tokenKey(d))
  } catch {
    return null
  }
}

export default function StaffPage() {
  const { department = '' } = useParams()
  if (!(DEPARTMENTS as readonly string[]).includes(department)) {
    return (
      <main className="p-8">
        <h1 className="text-3xl font-bold">Unknown department</h1>
        <p className="mt-2">
          Dashboards:{' '}
          {DEPARTMENTS.map((d, i) => (
            <span key={d}>
              {i > 0 && ', '}
              <Link className="text-care underline" to={`/${d}`}>
                {DEPARTMENT_LABELS[d]}
              </Link>
            </span>
          ))}
          .
        </p>
      </main>
    )
  }
  return <StaffGate department={department as Department} key={department} />
}

function StaffGate({ department }: { department: Department }) {
  const [token, setToken] = useState<string | null>(() => readToken(department))
  const auto = autoSignIn()
  const [autoFailed, setAutoFailed] = useState(false)
  useEffect(() => {
    document.title = `${DEPARTMENT_LABELS[department]} · Ting-ting`
    document.documentElement.lang = 'en'
  }, [department])

  // Demo: sign in with the demo PIN so the link opens straight onto the dashboard.
  useEffect(() => {
    if (token || !auto || autoFailed) return
    let alive = true
    api
      .login(department, demoPins().staff)
      .then(({ token: t }) => {
        if (!alive) return
        try {
          sessionStorage.setItem(tokenKey(department), t)
        } catch {
          // session storage unavailable: token lives in memory only
        }
        setToken(t)
      })
      .catch(() => alive && setAutoFailed(true)) // fall back to the PIN form
    return () => {
      alive = false
    }
  }, [token, auto, autoFailed, department])

  if (!token) {
    if (auto && !autoFailed) {
      return (
        <main className="grid min-h-screen place-items-center p-6 text-xl text-pine-soft" aria-busy="true">
          Opening {DEPARTMENT_LABELS[department]}…
        </main>
      )
    }
    return <Login department={department} onToken={setToken} />
  }
  return (
    <Dashboard
      department={department}
      token={token}
      canSignOut={!auto}
      onSignOut={() => {
        try {
          sessionStorage.removeItem(tokenKey(department))
        } catch {
          // ignore
        }
        setToken(null)
      }}
    />
  )
}

function Login({ department, onToken }: { department: Department; onToken: (t: string) => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    unlockAudio()
    try {
      const { token } = await api.login(department, pin)
      try {
        sessionStorage.setItem(tokenKey(department), token)
      } catch {
        // session storage unavailable: token lives in memory only
      }
      onToken(token)
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'That PIN is not correct.' : 'Cannot reach the server. Try again.')
    }
  }
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border-2 border-line bg-paper p-8">
        <h1 className="text-2xl font-bold">{DEPARTMENT_LABELS[department]}</h1>
        <p className="mt-1 text-pine-soft">4 West Med-Surg request queue</p>
        <label htmlFor="pin" className="mt-6 block font-bold">
          Department PIN
        </label>
        <input
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="mt-2 min-h-14 w-full rounded-xl border-2 border-pine px-4 text-2xl tracking-widest"
        />
        {error && (
          <p role="alert" className="mt-3 font-bold text-bell">
            {error}
          </p>
        )}
        <button type="submit" className="mt-6 min-h-14 w-full rounded-xl bg-care font-bold text-white hover:bg-care-deep">
          Sign in
        </button>
        <p className="mt-4 text-sm text-pine-soft">Demo PIN: 2468</p>
      </form>
    </main>
  )
}

const AGING_TEXT: Record<Aging, string> = {
  fresh: 'text-fresh',
  waiting: 'text-wait',
  late: 'text-bell',
}

// Most severe first (5 = urgent clinical), then HIGH priority, then longest waiting.
export function sortQueue(a: Ticket, b: Ticket) {
  const high = (t: Ticket) => (t.priority === 'HIGH' ? 0 : 1)
  return b.severity - a.severity || high(a) - high(b) || a.created_at.localeCompare(b.created_at)
}

function Dashboard({
  department,
  token,
  onSignOut,
  canSignOut = true,
}: {
  department: Department
  token: string
  onSignOut: () => void
  canSignOut?: boolean
}) {
  const isNursing = department === 'nursing'
  const [diverted, setDiverted] = useState<number | null>(null)
  const [staff, setStaff] = useState<StaffView[]>([])
  const [filter, setFilter] = useState<string>('all') // 'all' | staff_id | 'waiting'
  const [actionError, setActionError] = useState<string | null>(null)
  const now = useNow()

  const fetcher = useCallback(() => api.queue(department, token), [department, token])
  const fromEvent = useCallback(
    (e: TicketEvent) => (e.ticket.department === department ? e.ticket : null),
    [department],
  )
  const refreshMetrics = useCallback(() => {
    // The staff panel also hands waiting requests to anyone who just became available.
    api
      .staff(department, token)
      .then(setStaff)
      .catch(() => undefined)
    if (!isNursing) return
    api
      .metrics(token)
      .then((m) => setDiverted(m.diverted_from_nursing))
      .catch(() => undefined)
  }, [department, isNursing, token])

  const { items, status, error } = useLiveTickets<Ticket>({
    fetcher,
    channels: [`dept:${department}`],
    token,
    fromEvent,
    onEvent: refreshMetrics,
  })
  useEffect(() => {
    refreshMetrics()
    const id = setInterval(refreshMetrics, 30_000)
    return () => clearInterval(id)
  }, [refreshMetrics])
  useEffect(() => {
    if (error?.includes('expired') || error?.includes('Invalid')) onSignOut()
  }, [error, onSignOut])

  const open = useMemo(() => items.filter((t) => !CLOSED_STATUSES.includes(t.status)).sort(sortQueue), [items])
  const done = useMemo(
    () => items.filter((t) => CLOSED_STATUSES.includes(t.status)).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [items],
  )
  const waiting = open.filter((t) => !t.assigned_to).length
  const shown = open.filter((t) => filter === 'all' || (filter === 'waiting' ? !t.assigned_to : t.assigned_to === filter))
  const unackedHigh = open.filter((t) => t.priority === 'HIGH' && (t.status === 'NEW' || t.status === 'ESCALATED'))

  useEffect(() => {
    if (!isNursing || unackedHigh.length === 0) return
    playAlert()
    const id = setInterval(playAlert, 4000)
    return () => clearInterval(id)
  }, [isNursing, unackedHigh.length])

  async function act(ticket: Ticket, action: TicketAction) {
    setActionError(null)
    try {
      await api.updateTicket(ticket.ticket_id, action, token)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Update failed')
    }
  }

  const filters = [
    {
      id: 'all',
      label: 'Everyone',
      count: open.length,
      status: null as StaffStatus | null,
    },
    ...staff.map((s) => ({
      id: s.staff_id,
      label: s.name,
      count: open.filter((t) => t.assigned_to === s.staff_id).length,
      status: s.status,
    })),
    ...(staff.length > 0 ? [{ id: 'waiting', label: 'Waiting', count: waiting, status: null }] : []),
  ]

  return (
    <div className="min-h-screen">
      {isNursing && unackedHigh.length > 0 && (
        <div role="alert" className="bell-flash sticky top-0 z-10 px-5 py-4 text-[24px] font-bold text-white" data-testid="urgent-banner">
          Urgent: Room {[...new Set(unackedHigh.map((t) => t.room_id))].join(', Room ')} needs you now
        </div>
      )}
      <header className="flex flex-wrap items-center justify-between gap-4 px-5 pt-6 sm:px-8">
        <div>
          <h1 className="text-[36px] font-bold leading-tight">{DEPARTMENT_LABELS[department]}</h1>
          <p className="text-[20px] text-pine-soft">
            {open.length} open {open.length === 1 ? 'request' : 'requests'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isNursing && (
            <p className="rounded-2xl bg-fresh-tint px-4 py-2 text-fresh" data-testid="diverted-counter">
              <span className="text-2xl font-bold tabular-nums">{diverted ?? '–'}</span> sent to other teams today
            </p>
          )}
          <LiveBadge status={status} />
          {canSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="min-h-12 rounded-2xl border-2 border-line px-4 font-bold hover:border-pine"
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      <main className="px-5 py-6 sm:px-8">
        {actionError && (
          <p role="alert" className="mb-4 rounded-2xl bg-bell-tint p-4 font-bold text-bell-deep">
            {actionError}
          </p>
        )}
        {staff.length > 0 && (
          <div role="group" aria-label="Show requests for" className="mb-5 flex flex-wrap gap-3">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                aria-label={`${f.label} (${f.count})`}
                title={f.status ? STATUS_WORD[f.status] : undefined}
                onClick={() => setFilter(f.id)}
                className={`flex min-h-14 items-center gap-3 rounded-2xl border-2 px-4 text-[18px] font-bold ${
                  filter === f.id ? 'border-pine bg-pine text-white' : 'border-line bg-paper text-pine hover:border-pine'
                }`}
              >
                {f.status && <span aria-hidden="true" className={`size-3 rounded-full ${STATUS_DOT[f.status]}`} />}
                {f.label}
                <span
                  className={`min-w-8 rounded-full px-2 py-0.5 text-center tabular-nums ${
                    filter === f.id ? 'bg-white/20' : f.id === 'waiting' && f.count > 0 ? 'bg-wait-tint text-wait' : 'bg-curtain'
                  }`}
                >
                  {f.count}
                </span>
              </button>
            ))}
          </div>
        )}
        {shown.length === 0 ? (
          <p className="rounded-3xl border-2 border-dashed border-line p-10 text-center text-[22px] text-pine-soft">
            {open.length === 0 ? 'No open requests. New ones appear here instantly.' : 'Nothing here right now.'}
          </p>
        ) : (
          <ul className="grid gap-4 xl:grid-cols-2" aria-label="Open requests" data-testid="queue">
            {shown.map((t) => (
              <TicketRow key={t.ticket_id} ticket={t} now={now} department={department} onAction={act} />
            ))}
          </ul>
        )}
        <div className="mt-8 grid gap-4">
          {staff.length > 0 && (
            <Section title="Today’s schedule">
              <StaffPanel staff={staff} now={now} waiting={waiting} />
            </Section>
          )}
          {done.length > 0 && (
            <Section title={`Done today (${done.length})`}>
              <ul className="space-y-2">
                {done.map((t) => (
                  <li key={t.ticket_id} className="flex items-center gap-3 rounded-2xl bg-paper px-4 py-3 text-pine-soft">
                    <span className="font-bold tabular-nums text-pine">{t.room_id}</span>
                    <span>
                      {t.english_summary}
                      {t.status === 'CANCELLED' && ' (cancelled by patient)'}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </main>
    </div>
  )
}

const STATUS_WORD: Record<StaffStatus, string> = {
  available: 'Available',
  break: 'On break',
  off: 'Off shift',
}
const STATUS_DOT: Record<StaffStatus, string> = {
  available: 'bg-fresh',
  break: 'bg-wait',
  off: 'bg-curtain-deep',
}

/** Secondary information stays folded away until someone wants it. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-3xl border-2 border-line bg-paper">
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 text-[22px] font-bold [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDownIcon className="size-7 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  )
}

function LiveBadge({ status }: { status: string }) {
  const live = status === 'live'
  return (
    <span
      data-testid="live-status"
      data-status={status}
      className={`flex items-center gap-2 rounded-full px-4 py-2 font-bold ${live ? 'bg-fresh-tint text-fresh' : 'bg-wait-tint text-wait'}`}
    >
      <span aria-hidden="true" className={`size-2.5 rounded-full ${live ? 'bg-fresh' : 'bg-wait'}`} />
      {live ? 'Live' : 'Reconnecting · refreshing every 2 s'}
    </span>
  )
}

/** The one next step for each status, in the same words the patient sees. */
const NEXT: Partial<Record<Ticket['status'], { action: TicketAction; label: string }>> = {
  NEW: { action: 'acknowledge', label: 'Acknowledge' },
  ESCALATED: { action: 'acknowledge', label: 'Acknowledge' },
  ACKNOWLEDGED: { action: 'start', label: 'On my way' },
  IN_PROGRESS: { action: 'resolve', label: 'Done' },
}
const STAGE: Partial<Record<Ticket['status'], string>> = {
  ACKNOWLEDGED: 'Seen',
  IN_PROGRESS: 'On the way',
  ESCALATED: 'Escalated',
}

function TicketRow({
  ticket: t,
  now,
  department,
  onAction,
}: {
  ticket: Ticket
  now: number
  department: Department
  onAction: (t: Ticket, a: TicketAction) => void
}) {
  const waited = secondsSince(t.created_at, now)
  const age = aging(waited)
  const high = t.priority === 'HIGH'
  const next = NEXT[t.status]
  const stage = STAGE[t.status]

  return (
    <li
      data-testid="ticket"
      data-ticket-id={t.ticket_id}
      data-priority={t.priority}
      className={`flex flex-col rounded-3xl border-2 bg-paper p-5 ${high ? 'border-bell' : 'border-line'}`}
    >
      <div className="flex items-start gap-4">
        {t.tile ? (
          <TileGlyph tile={t.tile} className="size-9" />
        ) : (
          <span aria-hidden="true" className="grid size-[60px] shrink-0 place-items-center rounded-full bg-curtain text-pine">
            <BellGlyph />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl bg-pine px-3 py-0.5 text-[26px] font-bold tabular-nums text-white" aria-label={`Room ${t.room_id}`}>
              {t.room_id}
            </span>
            {high && <span className="rounded-full bg-bell px-3 py-1 text-sm font-bold tracking-wide text-white">URGENT</span>}
            {stage && <span className="rounded-full bg-care-tint px-3 py-1 text-sm font-bold text-care-deep">{stage}</span>}
            {t.nudge_count > 0 && (
              <span className="rounded-full bg-bell-tint px-3 py-1 text-sm font-bold text-bell-deep" data-testid="still-waiting">
                Patient still waiting
                {t.nudge_count > 1 ? ` ×${t.nudge_count}` : ''}
              </span>
            )}
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[17px] font-bold text-pine-soft" data-testid="where-who">
            <span className="flex items-center gap-1.5">
              <PinIcon className="size-5" />
              {t.unit ? `${t.unit}, Room ${t.room_id}` : `Room ${t.room_id}`}
            </span>
            {t.patient_alias && (
              <span className="flex items-center gap-1.5">
                <PersonIcon className="size-5" />
                {t.patient_age != null ? `${t.patient_alias}, ${t.patient_age} years` : t.patient_alias}
              </span>
            )}
          </p>
          <p className="mt-1 text-[22px] leading-snug">{t.english_summary}</p>
        </div>
        <span className={`text-[24px] font-bold tabular-nums ${AGING_TEXT[age]}`} aria-label={`Waiting ${formatWait(waited)}`}>
          {formatWait(waited)}
        </span>
      </div>

      <div className="mt-3 space-y-1 text-[16px] font-bold">
        {t.escalated_from && <p className="text-bell">Escalated by {DEPARTMENT_LABELS[t.escalated_from]}</p>}
        {t.assigned_name ? (
          <p className="text-care-deep" data-testid="assignee">
            Assigned to {t.assigned_name}
          </p>
        ) : (
          department !== 'it' && (
            <p className="text-wait" data-testid="assignee">
              Waiting for someone available
            </p>
          )
        )}
        {t.attendant_preference && (
          <p className={t.attendant_preference_met === false ? 'text-wait' : 'text-pine-soft'} data-testid="attendant-pref">
            Prefers {t.attendant_preference} staff
            {t.attendant_preference_met === false && ' · none available, assigned to the next available'}
          </p>
        )}
      </div>
      {t.notes.length > 0 && (
        <ul className="mt-3 space-y-1" aria-label="Patient notes">
          {t.notes.map((n) => (
            <li key={n.at} className="rounded-2xl bg-curtain px-4 py-2" lang={t.detected_language}>
              <span className="font-bold">Patient added:</span> “{n.text}”
            </li>
          ))}
        </ul>
      )}
      {department === 'nursing' && t.safety_reasons.length > 0 && (
        <details className="mt-2 text-sm text-pine-soft" data-testid="why-you">
          <summary className="w-fit cursor-pointer font-bold">Why you</summary>
          <p className="mt-1">{t.safety_reasons.join(', ')}</p>
        </details>
      )}

      <div className="mt-auto flex flex-wrap gap-3 pt-4">
        {next && (
          <button
            type="button"
            onClick={() => onAction(t, next.action)}
            className="min-h-16 flex-1 rounded-2xl bg-care px-6 text-[22px] font-bold text-white hover:bg-care-deep"
          >
            {next.label}
          </button>
        )}
        {next?.action !== 'resolve' && (
          <button
            type="button"
            onClick={() => onAction(t, 'resolve')}
            className="min-h-16 rounded-2xl border-2 border-care px-6 text-[22px] font-bold text-care-deep hover:bg-care-tint"
          >
            Done
          </button>
        )}
        {department !== 'nursing' && (
          <button
            type="button"
            onClick={() => onAction(t, 'escalate_to_nurse')}
            className="min-h-16 rounded-2xl border-2 border-bell px-5 text-[18px] font-bold text-bell hover:bg-bell-tint"
          >
            Clinical? Send to nurse
          </button>
        )}
      </div>
    </li>
  )
}

/** Typed or spoken requests have no tile: a call-bell glyph in the same circle. */
function BellGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-9"
    >
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  )
}
