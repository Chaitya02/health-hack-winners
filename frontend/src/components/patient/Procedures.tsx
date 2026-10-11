import type { DashboardStrings } from '../../i18n/dashboard'
import type { ProcedureItem } from '../../hooks/useProcedureReminders'
import { CalendarIcon, CloseIcon } from '../icons'

/** The patient's upcoming procedures: name and time, with the next one highlighted when it's close. */
export function Procedures({ items, d }: { items: ProcedureItem[]; d: DashboardStrings }) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby="coming-up" className="mb-5 rounded-3xl border-2 border-line bg-paper p-4" data-testid="procedures">
      <h2 id="coming-up" className="flex items-center gap-2 text-[22px] font-bold">
        <CalendarIcon className="size-7 text-care-deep" />
        {d.comingUp}
      </h2>
      <ul className="mt-2 space-y-2">
        {items.map((p) => (
          <li
            key={`${p.name}-${p.at}`}
            data-stage={p.stage}
            className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl px-4 py-2 ${
              p.stage === 'now' ? 'bg-care text-white' : p.stage === 'soon' ? 'bg-wait-tint' : 'bg-curtain'
            }`}
          >
            <span className="font-bold">{p.name}</span>
            <span className="tabular-nums">
              {p.time}
              {p.stage !== 'scheduled' && <strong> · {p.stage === 'now' ? d.procedureNow : d.inMinutes(p.minutes)}</strong>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The announcement, on screen as well as spoken. */
export function ProcedureNotice({ text, d, onClose }: { text: string; d: DashboardStrings; onClose: () => void }) {
  return (
    <div
      role="status"
      data-testid="procedure-notice"
      className="mx-5 mb-3 flex items-center gap-4 rounded-3xl bg-pine p-4 text-white shadow-xl sm:mx-8"
    >
      <CalendarIcon className="size-10 shrink-0" />
      <p className="flex-1 text-[22px] font-bold leading-snug">{text}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label={d.close}
        className="grid size-14 shrink-0 cursor-pointer place-items-center rounded-2xl bg-white/15 hover:bg-white/25"
      >
        <CloseIcon className="size-7" />
      </button>
    </div>
  )
}
