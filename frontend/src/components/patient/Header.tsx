import { HTML_LANG, STRINGS, type Strings } from '../../i18n/strings'
import type { Language } from '../../types/ticket'
import { LANGUAGES } from '../../types/ticket'

export function Header({
  roomId,
  unit,
  lang,
  t,
  onLangChange,
}: {
  roomId: string
  unit: string
  lang: Language
  t: Strings
  onLangChange: (lang: Language) => void
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-line bg-paper px-5 py-4 sm:px-8">
      <div className="flex items-center gap-4">
        <span
          className="rounded-2xl bg-pine px-4 py-2 text-[28px] font-bold tabular-nums text-white"
          aria-label={`Room ${roomId}`}
        >
          {roomId}
        </span>
        <span className="text-[20px] text-pine-soft">{unit}</span>
      </div>
      <label className="flex items-center gap-3 text-[20px]">
        <span>{t.language}</span>
        <select
          value={lang}
          onChange={(e) => onLangChange(e.target.value as Language)}
          className="min-h-16 rounded-xl border-2 border-pine bg-paper px-4 text-[22px]"
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l} lang={HTML_LANG[l]}>
              {STRINGS[l].languageName}
            </option>
          ))}
        </select>
      </label>
    </header>
  )
}
