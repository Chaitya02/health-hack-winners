import { useEffect, useRef, useState } from 'react'
import type { Strings, TileGroupKey, TileKey } from '../../i18n/strings'
import { iconFor, TileIcon, type Gender } from '../tileIcons'

export type QuickTile = Exclude<TileKey, 'nurse'>

type MainTile =
  | { kind: 'group'; key: TileGroupKey; icon: string; items: { key: QuickTile; icon: string }[] }
  | { kind: 'tile'; key: QuickTile; icon: string }

/**
 * Main tiles next to the nurse button (US-6). Groups open a short list of choices; every choice
 * maps to a deterministic backend tile in backend/app/tiles.py. Reorder or drop entries here to
 * change the main-tile count.
 */
export const MAIN_TILES: MainTile[] = [
  {
    kind: 'group',
    key: 'thirsty',
    icon: '💧',
    items: [
      { key: 'water', icon: '💧' },
      { key: 'ice', icon: '🧊' },
    ],
  },
  {
    kind: 'group',
    key: 'comfort',
    icon: '🛏️',
    items: [
      { key: 'pillow', icon: '🛏️' },
      { key: 'blanket', icon: '🧣' },
      { key: 'temperature', icon: '🌡️' },
      { key: 'tv', icon: '📺' },
    ],
  },
  {
    kind: 'group',
    key: 'foodMeds',
    icon: '🍽️',
    items: [
      { key: 'food', icon: '🍽️' },
      { key: 'medication', icon: '💊' },
    ],
  },
  {
    kind: 'group',
    key: 'emotional',
    icon: '💬',
    items: [
      { key: 'family', icon: '👪' },
      { key: 'counseling', icon: '💬' },
      { key: 'spiritual', icon: '🕊️' },
    ],
  },
  { kind: 'tile', key: 'bathroom', icon: '🚻' },
]

const tileClass = (large: boolean) =>
  `flex w-full flex-col items-center justify-center gap-1 rounded-2xl bg-paper p-3 text-center font-bold hover:border-care hover:bg-care-tint ${
    large ? 'min-h-40 border-4 border-pine text-[30px]' : 'min-h-28 border-2 border-line text-[22px]'
  }`

/** `large` (low-vision layout, US-4): two columns, bigger targets and text, high-contrast borders. */
export function RequestTiles({
  t,
  busy,
  onTap,
  large = false,
  exclude = [],
  gender = 'unspecified',
}: {
  t: Strings
  busy: boolean
  onTap: (tile: QuickTile) => void
  large?: boolean
  /** Tiles already shown elsewhere (the patient's top 3); groups left empty are dropped. */
  exclude?: QuickTile[]
  /** Picks the bathroom icon (woman / man / neutral). */
  gender?: Gender
}) {
  const iconClass = `text-pine ${large ? 'size-14' : 'size-10'}`
  const [open, setOpen] = useState<TileGroupKey | null>(null)
  const tiles = MAIN_TILES.flatMap((m): MainTile[] => {
    if (m.kind === 'tile') return exclude.includes(m.key) ? [] : [m]
    const items = m.items.filter((i) => !exclude.includes(i.key))
    return items.length ? [{ ...m, items }] : []
  })
  const group = tiles.find((m) => m.kind === 'group' && m.key === open)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (open) headingRef.current?.focus()
  }, [open])

  if (group?.kind === 'group') {
    return (
      <section aria-labelledby="tile-group-title" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="tile-group-title" ref={headingRef} tabIndex={-1} className="text-[26px] font-bold">
            <TileIcon name={group.key} className="mr-2 inline size-8 align-[-0.2em] text-pine" />
            {t.tileGroups[group.key]}
          </h2>
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="min-h-16 rounded-2xl border-2 border-pine bg-paper px-6 font-bold"
          >
            <span aria-hidden="true">← </span>
            {t.back}
          </button>
        </div>
        <ul className={`mt-3 grid grid-cols-2 ${large ? 'gap-4' : 'gap-3 md:grid-cols-4'}`}>
          {group.items.map((item) => (
            <li key={item.key}>
              <button type="button" disabled={busy} onClick={() => onTap(item.key)} className={tileClass(large)}>
                <TileIcon name={iconFor(item.key, gender)} className={iconClass} />
                {t.tiles[item.key]}
              </button>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <>
      <h2 className="mt-8 text-[26px] font-bold">{t.quickTitle}</h2>
      <ul className={`mt-3 grid grid-cols-2 ${large ? 'gap-4' : 'gap-3 md:grid-cols-3'}`}>
        {tiles.map((m) => (
          <li key={m.key}>
            <button
              type="button"
              disabled={busy}
              onClick={() => (m.kind === 'group' ? setOpen(m.key) : onTap(m.key))}
              className={tileClass(large)}
            >
              <TileIcon name={m.kind === 'group' ? m.key : iconFor(m.key, gender)} className={iconClass} />
              {m.kind === 'group' ? t.tileGroups[m.key] : t.tiles[m.key]}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
