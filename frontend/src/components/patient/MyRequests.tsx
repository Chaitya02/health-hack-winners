import type { Strings } from '../../i18n/strings'
import { TRACKER } from '../../i18n/tracker'
import { CLOSED_STATUSES, type Language, type PatientTicketView, type Status } from '../../types/ticket'
import { requestLabel, RequestTracker } from './RequestTracker'

const STATUS_STYLE: Record<Status, string> = {
  NEW: 'bg-curtain-deep text-pine',
  ACKNOWLEDGED: 'bg-care-tint text-care-deep',
  IN_PROGRESS: 'bg-care text-white',
  RESOLVED: 'bg-fresh-tint text-fresh',
  ESCALATED: 'bg-bell-tint text-bell-deep',
  CANCELLED: 'bg-curtain-deep text-pine-soft',
}

/** Open requests get a live tracker (O4); finished ones (done / cancelled) a compact list. */
export function MyRequests({
  requests,
  t,
  roomId,
  lang,
}: {
  requests: PatientTicketView[]
  t: Strings
  roomId: string
  lang: Language
}) {
  const sorted = [...requests].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const open = sorted.filter((r) => !CLOSED_STATUSES.includes(r.status))
  const closed = sorted.filter((r) => CLOSED_STATUSES.includes(r.status))
  return (
    <section aria-labelledby="my-requests" className="mt-10">
      <h2 id="my-requests" className="text-[26px] font-bold">
        {t.yourRequests}
      </h2>
      {sorted.length === 0 && <p className="mt-2 text-pine-soft">{t.noRequests}</p>}
      {open.length > 0 && (
        <ul className="mt-3 divide-y-2 divide-line rounded-2xl border-2 border-line bg-paper" aria-live="polite">
          {open.map((r) => (
            <RequestTracker key={r.ticket_id} request={r} roomId={roomId} lang={lang} t={t} />
          ))}
        </ul>
      )}
      {closed.length > 0 && (
        <>
          {open.length > 0 && <h3 className="mt-6 text-[22px] font-bold text-pine-soft">{TRACKER[lang].earlier}</h3>}
          <ul className="mt-3 divide-y-2 divide-line rounded-2xl border-2 border-line bg-paper">
            {closed.map((r) => (
              <li
                key={r.ticket_id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                data-testid="patient-request"
                data-status={r.status}
              >
                <span>
                  <span className="block font-bold" data-testid="request-label">
                    {requestLabel(r, t, lang)}
                  </span>
                  <span className="block text-[18px] text-pine-soft">{t.departments[r.department]}</span>
                </span>
                <span className={`rounded-full px-4 py-1 text-[20px] font-bold ${STATUS_STYLE[r.status]}`}>
                  {t.status[r.status]}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
