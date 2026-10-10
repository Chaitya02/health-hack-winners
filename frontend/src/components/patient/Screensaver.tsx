import { useEffect, useRef, useState } from 'react'
import { useNow } from '../../hooks/useNow'
import { SCREENSAVER } from '../../i18n/screensaver'
import { HTML_LANG, type Strings } from '../../i18n/strings'
import { CLOSED_STATUSES, type Language, type PatientTicketView } from '../../types/ticket'
import { EmergencyButton } from './EmergencyButton'

const TIP_MS = 8000

/**
 * Shown after inactivity (US-8). An overlay, so everything underneath (draft text, open
 * confirmation) is unchanged when the patient comes back. Safety rule: the nurse button stays
 * on screen and works with a single tap; open requests stay visible.
 */
export function Screensaver({
  roomId,
  lang,
  t,
  requests,
  onWake,
  onNurse,
}: {
  roomId: string
  lang: Language
  t: Strings
  requests: PatientTicketView[]
  onWake: () => void
  onNurse: () => void
}) {
  const s = SCREENSAVER[lang]
  const now = useNow(10_000)
  const [tip, setTip] = useState(0)
  const wakeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    wakeButton.current?.focus()
    const id = setInterval(() => setTip((i) => (i + 1) % s.tips.length), TIP_MS)
    return () => clearInterval(id)
  }, [s.tips.length])

  const open = requests
    .filter((r) => !CLOSED_STATUSES.includes(r.status))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const time = new Intl.DateTimeFormat(HTML_LANG[lang], { hour: 'numeric', minute: '2-digit' }).format(now)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={s.label}
      lang={HTML_LANG[lang]}
      data-testid="screensaver"
      // Visible by default; @starting-style fades it in where supported (no JS timing to stall).
      className="fixed inset-0 z-50 bg-pine text-white opacity-100 transition-opacity duration-700 starting:opacity-0 motion-reduce:transition-none"
    >
      {/* The whole screen is one button underneath the content, which lets taps through. */}
      <button
        ref={wakeButton}
        type="button"
        onClick={onWake}
        aria-label={s.tapToContinue}
        className="absolute inset-0 cursor-pointer focus-visible:outline-offset-[-8px]"
      />
      <div className="pointer-events-none relative flex h-full flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between gap-4">
          <span className="rounded-2xl bg-white/15 px-4 py-2 text-[28px] font-bold tabular-nums" aria-label={`Room ${roomId}`}>
            {roomId}
          </span>
          <span className="text-[44px] font-bold tabular-nums" data-testid="screensaver-clock">
            {time}
          </span>
        </div>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8">
          <p className="text-center text-[32px] leading-snug sm:text-[40px]" aria-live="polite" data-testid="screensaver-tip">
            {s.tips[tip]}
          </p>
          <div className="flex justify-center gap-2" aria-hidden="true">
            {s.tips.map((_, i) => (
              <span key={i} className={`size-3 rounded-full ${i === tip ? 'bg-white' : 'bg-white/30'}`} />
            ))}
          </div>

          {open.length > 0 && (
            <section aria-label={s.yourRequests} className="rounded-3xl bg-white/10 p-5">
              <h2 className="text-[22px] font-bold">{s.yourRequests}</h2>
              <ul className="mt-2 space-y-2">
                {open.slice(0, 3).map((r) => (
                  <li key={r.ticket_id} className="flex flex-wrap items-center justify-between gap-3 text-[22px]">
                    <span>{t.departments[r.department]}</span>
                    <span className="rounded-full bg-white px-4 py-1 text-[20px] font-bold text-pine">{t.status[r.status]}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="pointer-events-auto">
            <EmergencyButton lang={lang} busy={false} onConfirm={onNurse} />
          </div>
        </div>

        <p className="text-center text-[22px] text-white/80" aria-hidden="true">
          {s.tapToContinue}
        </p>
      </div>
    </div>
  )
}
