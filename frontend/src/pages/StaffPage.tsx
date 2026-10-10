import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveTickets } from '../hooks/useLiveTickets'
import { useNow } from '../hooks/useNow'
import { STRINGS } from '../i18n/strings'
import { playAlert, unlockAudio } from '../lib/alertSound'
import { api, ApiError } from '../lib/api'
import { aging, formatWait, secondsSince, type Aging } from '../lib/time'
import {
  DEPARTMENT_LABELS,
  DEPARTMENTS,
  type Department,
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
  useEffect(() => {
    document.title = `${DEPARTMENT_LABELS[department]} · Ting-ting`
    document.documentElement.lang = 'en'
  }, [department])

  if (!token) return <Login department={department} onToken={setToken} />
  return (
    <Dashboard
      department={department}
      token={token}
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

function sortQueue(a: Ticket, b: Ticket) {
  const pa = a.priority === 'HIGH' ? 0 : 1
  const pb = b.priority === 'HIGH' ? 0 : 1
  return pa - pb || a.created_at.localeCompare(b.created_at) // urgent first, then longest waiting
}

function Dashboard({
  department,
  token,
  onSignOut,
}: {
  department: Department
  token: string
  onSignOut: () => void
}) {
  const isNursing = department === 'nursing'
  const [diverted, setDiverted] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const now = useNow()

  const fetcher = useCallback(() => api.queue(department, token), [department, token])
  const fromEvent = useCallback(
    (e: TicketEvent) => (e.ticket.department === department ? e.ticket : null),
    [department],
  )
  const refreshMetrics = useCallback(() => {
    if (!isNursing) return
    api
      .metrics()
      .then((m) => setDiverted(m.diverted_from_nursing))
      .catch(() => undefined)
  }, [isNursing])

  const { items, status, error } = useLiveTickets<Ticket>({
    fetcher,
    channels: [`dept:${department}`],
    token,
    fromEvent,
    onEvent: refreshMetrics,
  })
  useEffect(() => {
    refreshMetrics()
    const id = setInterval(refreshMetrics, 10_000)
    return () => clearInterval(id)
  }, [refreshMetrics])
  useEffect(() => {
    if (error?.includes('expired') || error?.includes('Invalid')) onSignOut()
  }, [error, onSignOut])

  const open = useMemo(() => items.filter((t) => t.status !== 'RESOLVED').sort(sortQueue), [items])
  const done = useMemo(
    () => items.filter((t) => t.status === 'RESOLVED').sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [items],
  )
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
          <button type="button" onClick={onSignOut} className="min-h-11 rounded-lg border-2 border-line px-3 hover:border-pine">
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-5">
        {actionError && (
          <p role="alert" className="mb-3 rounded-xl bg-bell-tint p-3 font-bold text-bell-deep">
            {actionError}
          </p>
        )}
        {open.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-line p-8 text-center text-lg text-pine-soft">
            No open requests. New ones appear here instantly.
          </p>
        ) : (
          <ul className="space-y-3" aria-label="Open requests" data-testid="queue">
            {open.map((t) => (
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
  const lang = STRINGS[t.detected_language]
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
          <span className="rounded-full border border-line px-3 py-1 text-sm" title={lang.languageName}>
            {t.detected_language.toUpperCase()} · {lang.languageName}
          </span>
          {t.status !== 'NEW' && <span className="text-sm text-pine-soft">{t.status.replace('_', ' ').toLowerCase()}</span>}
        </div>
        <span className={`text-xl font-bold tabular-nums ${AGING_TEXT[age]}`} aria-label={`Waiting ${formatWait(waited)}`}>
          {formatWait(waited)}
        </span>
      </div>
      <p className="mt-3 text-xl leading-snug">{t.english_summary}</p>
      {t.escalated_from && <p className="mt-1 font-bold text-bell">Escalated by {DEPARTMENT_LABELS[t.escalated_from]}</p>}
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
