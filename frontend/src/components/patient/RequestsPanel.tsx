import { useEffect, useRef } from 'react'
import { DASHBOARD } from '../../i18n/dashboard'
import type { Strings } from '../../i18n/strings'
import { CLOSED_STATUSES, type Language, type PatientTicketView } from '../../types/ticket'
import { RequestTracker } from './RequestTracker'

/** Request history behind the header bell: open requests with their live tracker. Resolved
 * (and cancelled) requests drop out. */
export function RequestsPanel({
  requests,
  roomId,
  lang,
  t,
  onClose,
}: {
  requests: PatientTicketView[]
  roomId: string
  lang: Language
  t: Strings
  onClose: () => void
}) {
  const d = DASHBOARD[lang]
  const closeRef = useRef<HTMLButtonElement>(null)
  const open = requests
    .filter((r) => !CLOSED_STATUSES.includes(r.status))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-pine/40" data-testid="requests-panel">
      <button type="button" aria-hidden="true" tabIndex={-1} className="flex-1 cursor-default" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="requests-title"
        className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-curtain p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="requests-title" className="text-[28px] font-bold">
            {d.requests}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="min-h-14 rounded-xl border-2 border-pine bg-paper px-5 font-bold"
          >
            {d.close}
          </button>
        </div>
        {open.length === 0 ? (
          <p className="mt-6 text-pine-soft">{d.noOpen}</p>
        ) : (
          <ul className="mt-4 divide-y-2 divide-line rounded-2xl border-2 border-line bg-paper" aria-live="polite">
            {open.map((r) => (
              <RequestTracker key={r.ticket_id} request={r} roomId={roomId} lang={lang} t={t} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
