import { DASHBOARD } from '../../i18n/dashboard'
import { BellIcon, HomeIcon } from '../icons'
import { LanguageSelect } from './LanguageSelect'
import type { Language } from '../../types/ticket'

/** Dashboard header: the patient's name and age only, plus language, start over and the
 * requests bell (badge = open requests; opens the request history). */
export function PatientHeader({
  name,
  age,
  lang,
  openCount,
  onLangChange,
  onOpenRequests,
  onStartOver,
}: {
  name: string
  age: number | null
  lang: Language
  openCount: number
  onLangChange: (l: Language) => void
  onOpenRequests: () => void
  onStartOver: () => void
}) {
  const d = DASHBOARD[lang]
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
      <h1 data-testid="patient-identity" className="leading-tight">
        <span className="text-[40px] font-bold">{name}</span>
        {age != null && <span className="text-[28px] text-pine-soft">, {d.ageYears(age)}</span>}
      </h1>
      <div className="flex flex-wrap items-center gap-3">
        <LanguageSelect lang={lang} onChange={onLangChange} />
        <button
          type="button"
          onClick={onStartOver}
          aria-label={d.startOver}
          title={d.startOver}
          data-testid="start-over"
          className="grid size-16 place-items-center rounded-2xl border-2 border-pine bg-paper text-pine hover:bg-curtain"
        >
          <HomeIcon />
        </button>
        <button
          type="button"
          onClick={onOpenRequests}
          aria-label={`${d.requests}: ${d.openCount(openCount)}`}
          data-testid="requests-bell"
          title={d.requests}
          className="relative grid size-16 place-items-center rounded-2xl border-2 border-pine bg-paper text-pine hover:bg-curtain"
        >
          <BellIcon />
          {openCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-2 -top-2 grid min-w-8 place-items-center rounded-full bg-bell px-2 text-[18px] font-bold tabular-nums text-white"
            >
              {openCount}
            </span>
          )}
        </button>
      </div>
    </header>
  )
}
