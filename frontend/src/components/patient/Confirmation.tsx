import { HTML_LANG, type Strings } from '../../i18n/strings'
import type { CreateRequestResponse } from '../../types/ticket'

export function Confirmation({
  result,
  t,
  onDone,
  raised = false,
}: {
  result: CreateRequestResponse
  t: Strings
  onDone: () => void
  /** A profile rule raised the priority (fall risk, US-5); the reason is in `confirmation`. */
  raised?: boolean
}) {
  const clinical = result.is_clinical
  return (
    <section
      role="status"
      aria-live="assertive"
      data-testid="confirmation"
      className={`rounded-3xl p-8 text-center ${clinical ? 'bg-bell text-white' : 'bg-care-tint text-pine'}`}
    >
      <p aria-hidden="true" className="text-[64px]">
        {clinical ? '🔔' : '✓'}
      </p>
      {raised && (
        <p
          data-testid="higher-priority"
          className="mx-auto mb-4 inline-block rounded-full bg-wait-tint px-5 py-2 text-[22px] font-bold text-pine ring-2 ring-wait"
        >
          <span aria-hidden="true">⬆ </span>
          {t.higherPriority}
        </p>
      )}
      <p
        className="mx-auto max-w-[28ch] text-[34px] font-bold leading-tight"
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
