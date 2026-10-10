import { DASHBOARD } from '../../i18n/dashboard'
import { HTML_LANG, STRINGS, type Strings } from '../../i18n/strings'
import { LANGUAGES, type Language } from '../../types/ticket'

/** Dashboard header: the patient's name and age only, plus language, start over and the
 * requests bell (badge = open requests; opens the request history). */
export function PatientHeader({
  name,
  age,
  lang,
  t,
  openCount,
  onLangChange,
  onOpenRequests,
  onStartOver,
}: {
  name: string
  age: number | null
  lang: Language
  t: Strings
  openCount: number
  onLangChange: (l: Language) => void
  onOpenRequests: () => void
  onStartOver: () => void
}) {
  const d = DASHBOARD[lang]
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-line bg-paper px-5 py-4 sm:px-8">
      <div data-testid="patient-identity">
        <p className="text-[28px] font-bold leading-tight">{name}</p>
        {age != null && <p className="text-[20px] text-pine-soft">{d.ageYears(age)}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[18px]">
          <span className="sr-only">{t.language}</span>
          <select
            value={lang}
            onChange={(e) => onLangChange(e.target.value as Language)}
            className="min-h-14 rounded-xl border-2 border-pine bg-paper px-3 text-[20px]"
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l} lang={HTML_LANG[l]}>
                {STRINGS[l].languageName}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={onStartOver} className="min-h-14 rounded-xl px-3 text-[18px] text-pine-soft underline">
          {d.startOver}
        </button>
        <button
          type="button"
          onClick={onOpenRequests}
          aria-label={`${d.requests}: ${d.openCount(openCount)}`}
          data-testid="requests-bell"
          className="relative grid size-16 place-items-center rounded-2xl border-2 border-pine bg-paper text-[30px] hover:bg-curtain"
        >
          <span aria-hidden="true">🔔</span>
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
