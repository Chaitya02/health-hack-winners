import { useState } from 'react'
import { DASHBOARD } from '../../i18n/dashboard'
import { ChevronDownIcon } from '../icons'
import type { Strings } from '../../i18n/strings'
import type { Language } from '../../types/ticket'
import { TileGlyph, type Gender } from '../tileIcons'
import { RequestTiles, type QuickTile } from './RequestTiles'

/** The patient's top buttons (personalised) and everything else behind "More requests". */
export function PersonalTiles({
  top,
  t,
  lang,
  busy,
  large,
  onTap,
  gender = 'unspecified',
  blocked = {},
  onBlocked,
}: {
  top: QuickTile[]
  t: Strings
  lang: Language
  busy: boolean
  large: boolean
  onTap: (tile: QuickTile) => void
  gender?: Gender
  /** US-5: tiles the profile rules out, with why (see profileRules.ts). */
  blocked?: Partial<Record<QuickTile, string>>
  onBlocked?: (why: string) => void
}) {
  const d = DASHBOARD[lang]
  const [more, setMore] = useState(false)
  return (
    <section aria-label={d.forYou} className="mt-5">
      <ul className="flex flex-col gap-3" data-testid="top-tiles">
        {top.map((key) => (
          <li key={key}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onTap(key)}
              className={`flex h-full w-full flex-col items-center justify-center gap-3 rounded-3xl border-4 border-pine bg-paper p-3 text-center font-bold leading-tight hover:bg-care-tint ${
                large ? 'min-h-52 text-[30px]' : 'min-h-44 text-[26px]'
              }`}
            >
              <TileGlyph tile={key} gender={gender} className={large ? 'size-16' : 'size-12'} />
              {t.tiles[key]}
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        aria-expanded={more}
        aria-controls="more-requests"
        onClick={() => setMore((v) => !v)}
        className="mt-4 flex min-h-16 w-full items-center justify-between rounded-2xl border-2 border-line bg-paper px-5 font-bold hover:border-pine"
      >
        {more ? d.fewer : d.more}
        <ChevronDownIcon className={`size-7 transition-transform motion-reduce:transition-none ${more ? 'rotate-180' : ''}`} />
      </button>
      {more && (
        <div id="more-requests" className="mt-1">
          <RequestTiles t={t} busy={busy} onTap={onTap} large={large} exclude={top} gender={gender} showTitle={false} blocked={blocked} onBlocked={onBlocked} />
        </div>
      )}
    </section>
  )
}
