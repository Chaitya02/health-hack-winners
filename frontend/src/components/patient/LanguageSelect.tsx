import { HTML_LANG, STRINGS } from '../../i18n/strings'
import { LANGUAGES, type Language } from '../../types/ticket'
import { ChevronDownIcon, GlobeIcon } from '../icons'

/** Themed language picker: native select (keyboard/screen-reader friendly) styled like the
 * header's icon buttons, with a globe and a chevron. */
export function LanguageSelect({ lang, onChange }: { lang: Language; onChange: (l: Language) => void }) {
  return (
    <label className="relative flex h-16 items-center text-pine">
      <span className="sr-only">{STRINGS[lang].language}</span>
      <span className="pointer-events-none absolute left-4">
        <GlobeIcon />
      </span>
      <select
        value={lang}
        onChange={(e) => onChange(e.target.value as Language)}
        className="h-16 cursor-pointer appearance-none rounded-2xl border-2 border-pine bg-paper pl-12 pr-11 text-[20px] font-bold hover:bg-curtain"
      >
        {LANGUAGES.map((l) => (
          <option key={l} value={l} lang={HTML_LANG[l]}>
            {STRINGS[l].languageName}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3">
        <ChevronDownIcon />
      </span>
    </label>
  )
}
