import { useEffect, useState } from 'react'
import { useNow } from '../../hooks/useNow'
import { HTML_LANG, type Strings } from '../../i18n/strings'
import { TRACKER } from '../../i18n/tracker'
import { api, ApiError } from '../../lib/api'
import type { Language, PatientAction, PatientTicketView, Status } from '../../types/ticket'

export const STEPS = ['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'] as const satisfies readonly Status[]

/** Which step is current. An escalated request starts over at "Sent" (now with the nurse). */
export function stepIndex(status: Status): number {
  const i = (STEPS as readonly Status[]).indexOf(status)
  return i === -1 ? 0 : i
}

/** Minutes left until the ETA (rounded up), 0 once it has passed, null without an ETA. */
export function minutesLeft(r: Pick<PatientTicketView, 'created_at' | 'eta_minutes'>, now: number): number | null {
  if (r.eta_minutes == null) return null
  const due = Date.parse(r.created_at) + r.eta_minutes * 60_000
  return Math.max(0, Math.ceil((due - now) / 60_000))
}

/** Clinical requests can only be closed by the nurse (the API refuses them too). */
export function nurseOnly(r: Pick<PatientTicketView, 'department' | 'status'>): boolean {
  return r.department === 'nursing' || r.status === 'ESCALATED'
}

/** What the card is about: the tapped button's name, else a category label. Never free text. */
export function requestLabel(r: Pick<PatientTicketView, 'tile' | 'category'>, t: Strings, lang: Language): string {
  const tiles = t.tiles as Record<string, string>
  return (r.tile && tiles[r.tile]) || TRACKER[lang].categories[r.category]
}

const NUDGE_COOLDOWN_MS = 60_000

/** One open request (US-2 "Mirror"): steps with times, ETA, still waiting, cancel. */
export function RequestTracker({
  request: r,
  roomId,
  lang,
  t,
}: {
  request: PatientTicketView
  roomId: string
  lang: Language
  t: Strings
}) {
  const s = TRACKER[lang]
  const now = useNow(15_000)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [nudgedAt, setNudgedAt] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (nudgedAt == null) return
    const id = setTimeout(() => setNudgedAt(null), NUDGE_COOLDOWN_MS)
    return () => clearTimeout(id)
  }, [nudgedAt])

  async function act(action: PatientAction) {
    setBusy(true)
    setMessage(null)
    try {
      await api.patientAction(roomId, r.ticket_id, action)
      if (action === 'still_waiting') setNudgedAt(Date.now())
      setConfirming(false)
    } catch (e) {
      setMessage(e instanceof ApiError && e.status === 429 ? t.tooMany : e instanceof ApiError && e.status === 409 ? s.nurseOnly : s.failed)
    } finally {
      setBusy(false)
    }
  }

  const current = stepIndex(r.status)
  const left = minutesLeft(r, now)
  const time = (status: Status) => {
    const at = [...r.history].reverse().find((h) => h.status === status)?.at
    return at ? new Intl.DateTimeFormat(HTML_LANG[lang], { hour: 'numeric', minute: '2-digit' }).format(Date.parse(at)) : null
  }

  return (
    <li className="px-5 py-4" data-testid="patient-request" data-status={r.status}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>
          <span className="block font-bold" data-testid="request-label">
            {requestLabel(r, t, lang)}
          </span>
          <span className="block text-[18px] text-pine-soft">{t.departments[r.department]}</span>
        </span>
        {r.status === 'ESCALATED' ? (
          <span className="rounded-full bg-bell-tint px-4 py-1 text-[20px] font-bold text-bell-deep">{t.status.ESCALATED}</span>
        ) : (
          left != null && (
            <span className="text-[20px] font-bold tabular-nums text-care-deep" data-testid="eta">
              {left > 0 ? s.eta(left) : s.soon}
            </span>
          )
        )}
      </div>

      {r.patient_notice && (
        <p role="status" className="mt-3 rounded-2xl bg-wait-tint px-4 py-3 text-[20px] font-bold text-wait" data-testid="patient-notice">
          {s.notice[r.patient_notice]}
        </p>
      )}

      <ol aria-label={s.progress} className="mt-3 grid grid-cols-4 gap-1">
        {STEPS.map((step, i) => {
          const done = i < current
          const here = i === current
          return (
            <li key={step} aria-current={here ? 'step' : undefined} className="flex flex-col gap-1">
              <span className={`h-2 rounded-full ${done || here ? 'bg-care' : 'bg-curtain-deep'}`} aria-hidden="true" />
              <span className={`text-[18px] leading-tight ${here ? 'font-bold text-pine' : done ? 'text-pine' : 'text-pine-soft'}`}>
                {t.status[step]}
              </span>
              {(done || here) && time(step) && <span className="text-[16px] tabular-nums text-pine-soft">{time(step)}</span>}
            </li>
          )
        })}
      </ol>

      {confirming ? (
        <div className="mt-4 flex flex-wrap items-center gap-3" role="group" aria-label={s.confirmCancel}>
          <span className="font-bold">{s.confirmCancel}</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act('cancel')}
            className="min-h-14 rounded-xl bg-pine px-5 font-bold text-white"
          >
            {s.yesCancel}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="min-h-14 rounded-xl border-2 border-pine px-5 font-bold">
            {s.keep}
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {nudgedAt != null ? (
            <span role="status" className="font-bold text-care-deep">
              {s.nudged}
            </span>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act('still_waiting')}
              className="min-h-14 rounded-xl bg-care px-5 font-bold text-white hover:bg-care-deep"
            >
              {s.stillWaiting}
            </button>
          )}
          {!nurseOnly(r) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(true)}
              className="min-h-14 rounded-xl border-2 border-line px-5 hover:border-pine"
            >
              {s.cancel}
            </button>
          )}
        </div>
      )}
      {message && (
        <p role="alert" className="mt-3 font-bold text-bell-deep">
          {message}
        </p>
      )}
    </li>
  )
}
