import { HTML_LANG, type Strings } from '../../i18n/strings'
import { BellIcon, CheckIcon } from '../icons'
import { raisedForFallRisk } from './profileRules'
import type { CreateRequestResponse } from '../../types/ticket'

export function Confirmation({
  result,
  t,
  onDone,
}: {
  result: CreateRequestResponse
  t: Strings
  onDone: () => void
}) {
  const clinical = result.is_clinical
  return (
    <section
      role="status"
      aria-live="assertive"
      data-testid="confirmation"
      className={`rounded-3xl p-8 text-center ${clinical ? 'bg-bell text-white' : 'bg-care-tint text-pine'}`}
    >
      <span
        aria-hidden="true"
        className={`mx-auto grid size-24 place-items-center rounded-full ${clinical ? 'bg-white/20 text-white' : 'bg-care text-white'}`}
        data-icon={clinical ? 'bell' : 'check'}
      >
        {clinical ? <BellIcon className="size-14" /> : <CheckIcon className="size-14" />}
      </span>
      {raisedForFallRisk(result) && (
        <p className="mx-auto mt-4 w-fit rounded-full bg-wait-tint px-4 py-1 text-[20px] font-bold text-wait" data-testid="priority-badge">
          {t.higherPriority}
        </p>
      )}
      <p
        className="mx-auto mt-5 max-w-[28ch] text-[34px] font-bold leading-tight"
        lang={HTML_LANG[result.confirmation_language]}
      >
        {result.confirmation}
      </p>
      <button
        type="button"
        onClick={onDone}
        className={`mt-8 min-h-16 rounded-2xl px-8 font-bold ${clinical ? 'bg-white text-bell-deep' : 'bg-pine text-white'}`}
      >
        {t.newRequest}
      </button>
    </section>
  )
}
