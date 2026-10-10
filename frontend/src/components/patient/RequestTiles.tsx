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

export function RequestTiles({ t, busy, onTap }: { t: Strings; busy: boolean; onTap: (tile: QuickTile) => void }) {
  return (
    <>
      <h2 className="mt-8 text-[26px] font-bold">{t.quickTitle}</h2>
      <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {TILES.map((tile) => (
          <li key={tile.key}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onTap(tile.key)}
              className="flex min-h-28 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-line bg-paper p-3 text-center text-[22px] font-bold hover:border-care hover:bg-care-tint"
            >
              <span aria-hidden="true" className="text-[36px]">
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
