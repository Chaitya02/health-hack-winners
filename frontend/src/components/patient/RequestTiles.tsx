import type { Strings, TileKey } from '../../i18n/strings'

export type QuickTile = Exclude<TileKey, 'nurse'>

const TILES: { key: QuickTile; icon: string }[] = [
  { key: 'water', icon: '💧' },
  { key: 'ice', icon: '🧊' },
  { key: 'pillow', icon: '🛏️' },
  { key: 'blanket', icon: '🧣' },
  { key: 'bathroom', icon: '🚻' },
  { key: 'temperature', icon: '🌡️' },
  { key: 'tv', icon: '📺' },
  { key: 'food', icon: '🍽️' },
]

/** `large` (low-vision layout, US-4): two columns, bigger targets and text, high-contrast borders. */
export function RequestTiles({
  t,
  busy,
  onTap,
  large = false,
}: {
  t: Strings
  busy: boolean
  onTap: (tile: QuickTile) => void
  large?: boolean
}) {
  return (
    <>
      <h2 className="mt-8 text-[26px] font-bold">{t.quickTitle}</h2>
      <ul className={`mt-3 grid grid-cols-2 ${large ? 'gap-4' : 'gap-3 md:grid-cols-4'}`}>
        {TILES.map((tile) => (
          <li key={tile.key}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onTap(tile.key)}
              className={`flex w-full flex-col items-center justify-center gap-1 rounded-2xl bg-paper p-3 text-center font-bold hover:border-care hover:bg-care-tint ${
                large ? 'min-h-40 border-4 border-pine text-[30px]' : 'min-h-28 border-2 border-line text-[22px]'
              }`}
            >
              <span aria-hidden="true" className={large ? 'text-[56px]' : 'text-[36px]'}>
                {tile.icon}
              </span>
              {t.tiles[tile.key]}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
