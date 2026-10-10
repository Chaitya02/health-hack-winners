import { useState } from 'react'
import { DASHBOARD } from '../../i18n/dashboard'
import type { Strings } from '../../i18n/strings'
import type { Language } from '../../types/ticket'
import { MAIN_TILES, RequestTiles, type QuickTile } from './RequestTiles'

const ICON: Record<string, string> = Object.fromEntries(
  MAIN_TILES.flatMap((m) => (m.kind === 'group' ? m.items : [m])).map((i) => [i.key, i.icon]),
)

/** The patient's top buttons (personalised) and everything else behind "More requests". */
export function PersonalTiles({
  top,
  t,
  lang,
  busy,
  large,
  onTap,
}: {
  top: QuickTile[]
  t: Strings
  lang: Language
  busy: boolean
  large: boolean
  onTap: (tile: QuickTile) => void
}) {
  const d = DASHBOARD[lang]
  const [more, setMore] = useState(false)
  return (
    <section aria-labelledby="for-you" className="mt-6">
      <h2 id="for-you" className="text-[26px] font-bold">
        {d.forYou}
      </h2>
      <ul className="mt-3 grid grid-cols-3 gap-3" data-testid="top-tiles">
        {top.map((key) => (
          <li key={key}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onTap(key)}
              className={`flex h-full w-full flex-col items-center justify-center gap-2 rounded-3xl border-4 border-pine bg-paper p-3 text-center font-bold hover:bg-care-tint ${
                large ? 'min-h-44 text-[30px]' : 'min-h-36 text-[24px]'
              }`}
            >
              <span aria-hidden="true" className={large ? 'text-[60px]' : 'text-[48px]'}>
                {ICON[key]}
              </span>
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
        <span aria-hidden="true">{more ? '▲' : '▼'}</span>
      </button>
      {more && (
        <div id="more-requests" className="-mt-4">
          <RequestTiles t={t} busy={busy} onTap={onTap} large={large} exclude={top} />
        </div>
      )}
    </section>
  )
}
