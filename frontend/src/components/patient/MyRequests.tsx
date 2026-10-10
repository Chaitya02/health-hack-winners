import type { Strings } from '../../i18n/strings'
import type { PatientTicketView, Status } from '../../types/ticket'

const STATUS_STYLE: Record<Status, string> = {
  NEW: 'bg-curtain-deep text-pine',
  ACKNOWLEDGED: 'bg-care-tint text-care-deep',
  IN_PROGRESS: 'bg-care text-white',
  RESOLVED: 'bg-fresh-tint text-fresh',
  ESCALATED: 'bg-bell-tint text-bell-deep',
  CANCELLED: 'bg-curtain-deep text-pine-soft',
}

export function MyRequests({ requests, t }: { requests: PatientTicketView[]; t: Strings }) {
  const sorted = [...requests].sort((a, b) => b.created_at.localeCompare(a.created_at))
  return (
    <section aria-labelledby="my-requests" className="mt-10">
      <h2 id="my-requests" className="text-[26px] font-bold">
        {t.yourRequests}
      </h2>
      {sorted.length === 0 ? (
        <p className="mt-2 text-pine-soft">{t.noRequests}</p>
      ) : (
        <ul className="mt-3 divide-y-2 divide-line rounded-2xl border-2 border-line bg-paper" aria-live="polite">
          {sorted.map((r) => (
            <li
              key={r.ticket_id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              data-testid="patient-request"
            >
              <span className="font-bold">{t.departments[r.department]}</span>
              <span className={`rounded-full px-4 py-1 text-[20px] font-bold ${STATUS_STYLE[r.status]}`}>
                {t.status[r.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
