import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveTickets } from '../hooks/useLiveTickets'
import { useNow } from '../hooks/useNow'
import { playAlert, unlockAudio } from '../lib/alertSound'
import { api, ApiError } from '../lib/api'
import { autoSignIn, demoPins } from '../lib/config'
import { aging, formatWait, secondsSince, type Aging } from '../lib/time'
import { StaffPanel } from '../components/staff/StaffPanel'
import {
  CLOSED_STATUSES,
  DEPARTMENT_LABELS,
  DEPARTMENTS,
  type Department,
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

const AGING_EDGE: Record<Aging, string> = {
  fresh: 'border-l-fresh',
  waiting: 'border-l-wait',
  late: 'border-l-bell',
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

  return (
    <div className="min-h-screen">
      {isNursing && unackedHigh.length > 0 && (
        <div role="alert" className="bell-flash sticky top-0 z-10 px-5 py-3 text-xl font-bold text-white" data-testid="urgent-banner">
          Urgent: Room {[...new Set(unackedHigh.map((t) => t.room_id))].join(', Room ')} needs you now
        </div>
      )}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-line bg-paper px-5 py-4">
        <div>
          <h1 className="text-2xl font-bold">{DEPARTMENT_LABELS[department]}</h1>
          <p className="text-pine-soft">4 West Med-Surg · {open.length} open</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isNursing && (
            <p className="rounded-xl bg-fresh-tint px-4 py-2 text-fresh" data-testid="diverted-counter">
              <span className="text-2xl font-bold tabular-nums">{diverted ?? '–'}</span> requests diverted from nurses today
            </p>
          )}
          <LiveBadge status={status} />
          {canSignOut && (
            <button type="button" onClick={onSignOut} className="min-h-11 rounded-lg border-2 border-line px-3 hover:border-pine">
              Sign out
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        {actionError && (
          <p role="alert" className="mb-3 rounded-xl bg-bell-tint p-3 font-bold text-bell-deep">
            {actionError}
          </p>
        )}
        {staff.length > 0 && (
          <>
            <StaffPanel staff={staff} now={now} waiting={waiting} />
            <div role="group" aria-label="Show requests for" className="mb-3 mt-4 flex flex-wrap gap-2">
              {[
                { id: 'all', label: `Everyone (${open.length})` },
                ...staff.map((s) => ({ id: s.staff_id, label: `${s.name} (${open.filter((t) => t.assigned_to === s.staff_id).length})` })),
                { id: 'waiting', label: `Waiting (${waiting})` },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`min-h-11 rounded-full border-2 px-4 font-bold ${filter === f.id ? 'border-pine bg-pine text-white' : 'border-line bg-paper text-pine hover:border-pine'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </>
        )}
        {shown.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-line p-8 text-center text-lg text-pine-soft">
            {open.length === 0 ? 'No open requests. New ones appear here instantly.' : 'Nothing here right now.'}
          </p>
        ) : (
          <ul className="space-y-3" aria-label="Open requests" data-testid="queue">
            {shown.map((t) => (
              <TicketRow key={t.ticket_id} ticket={t} now={now} department={department} onAction={act} />
            ))}
          </ul>
        )}
        {done.length > 0 && (
          <details className="mt-8">
            <summary className="cursor-pointer text-lg font-bold">Done today ({done.length})</summary>
            <ul className="mt-3 space-y-2">
              {done.map((t) => (
                <li key={t.ticket_id} className="rounded-xl bg-paper px-4 py-3 text-pine-soft">
                  Room {t.room_id}: {t.english_summary}
                  {t.status === 'CANCELLED' && ' (cancelled by patient)'}
                </li>
              ))}
            </ul>
          </details>
        )}
      </main>
    </div>
  )
}

function LiveBadge({ status }: { status: string }) {
  const live = status === 'live'
  return (
    <span
      data-testid="live-status"
      data-status={status}
      className={`rounded-full px-3 py-1 text-sm font-bold ${live ? 'bg-fresh-tint text-fresh' : 'bg-wait-tint text-wait'}`}
    >
      {live ? '● Live' : 'Reconnecting · refreshing every 2 s'}
    </span>
  )
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
  const [showOriginal, setShowOriginal] = useState(false)
  const waited = secondsSince(t.created_at, now)
  const age = aging(waited)
  const high = t.priority === 'HIGH'
  const actions: { action: TicketAction; label: string }[] = []
  if (t.status === 'NEW' || t.status === 'ESCALATED') actions.push({ action: 'acknowledge', label: 'Acknowledge' })
  if (t.status !== 'IN_PROGRESS') actions.push({ action: 'start', label: 'On my way' })
  actions.push({ action: 'resolve', label: 'Resolve' })

  return (
    <li
      data-testid="ticket"
      data-ticket-id={t.ticket_id}
      data-priority={t.priority}
      className={`rounded-2xl border-2 border-l-[10px] bg-paper p-4 ${AGING_EDGE[age]} ${high ? 'border-bell' : 'border-line'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-pine px-3 py-1 text-2xl font-bold tabular-nums text-white">{t.room_id}</span>
          <span
            className={`rounded-full px-3 py-1 text-sm font-bold ${
              high ? 'bg-bell text-white' : t.priority === 'LOW' ? 'bg-curtain-deep text-pine-soft' : 'bg-care-tint text-care-deep'
            }`}
          >
            {high ? 'HIGH' : t.priority === 'LOW' ? 'Low' : 'Normal'}
          </span>
          {t.status !== 'NEW' && <span className="text-sm text-pine-soft">{t.status.replace('_', ' ').toLowerCase()}</span>}
          {t.nudge_count > 0 && (
            <span className="rounded-full bg-bell-tint px-3 py-1 text-sm font-bold text-bell-deep" data-testid="still-waiting">
              Patient still waiting{t.nudge_count > 1 ? ` ×${t.nudge_count}` : ''}
            </span>
          )}
        </div>
        <span className={`text-xl font-bold tabular-nums ${AGING_TEXT[age]}`} aria-label={`Waiting ${formatWait(waited)}`}>
          {formatWait(waited)}
        </span>
      </div>
      <p className="mt-3 text-xl leading-snug">{t.english_summary}</p>
      {t.escalated_from && <p className="mt-1 font-bold text-bell">Escalated by {DEPARTMENT_LABELS[t.escalated_from]}</p>}
      {t.assigned_name ? (
        <p className="mt-1 text-sm font-bold text-care-deep" data-testid="assignee">
          Assigned to {t.assigned_name}
        </p>
      ) : (
        department !== 'it' && (
          <p className="mt-1 text-sm font-bold text-wait" data-testid="assignee">
            Waiting for someone available
          </p>
        )
      )}
      {t.notes.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label="Patient notes">
          {t.notes.map((n) => (
            <li key={n.at} className="rounded-xl bg-curtain px-3 py-2" lang={t.detected_language}>
              <span className="font-bold">Patient added:</span> “{n.text}”
            </li>
          ))}
        </ul>
      )}
      {department === 'nursing' && t.safety_reasons.length > 0 && (
        <p className="mt-1 text-sm text-pine-soft">Why you: {t.safety_reasons.join(', ')}</p>
      )}
      {showOriginal && (
        <p className="mt-2 rounded-xl bg-curtain p-3 italic" lang={t.detected_language}>
          “{t.original_text}”
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.action}
            type="button"
            onClick={() => onAction(t, a.action)}
            className="min-h-12 rounded-xl bg-care px-4 font-bold text-white hover:bg-care-deep"
          >
            {a.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowOriginal((v) => !v)}
          aria-expanded={showOriginal}
          className="min-h-12 rounded-xl border-2 border-line px-4 hover:border-pine"
        >
          {showOriginal ? 'Hide original' : 'Show original'}
        </button>
        {department !== 'nursing' && (
          <button
            type="button"
            onClick={() => onAction(t, 'escalate_to_nurse')}
            className="min-h-12 rounded-xl border-2 border-bell px-4 font-bold text-bell hover:bg-bell-tint"
          >
            This is clinical: send to nurse
          </button>
        )}
      </div>
    </li>
  )
}
