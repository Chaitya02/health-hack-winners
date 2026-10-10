import { useEffect, useRef, useState } from 'react'
import type { Strings, TileGroupKey, TileKey } from '../../i18n/strings'

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

const tileClass = (large: boolean, blocked: boolean) =>
  `flex w-full flex-col items-center justify-center gap-1 rounded-2xl p-3 text-center font-bold ${
    large ? 'min-h-40 border-4 text-[30px]' : 'min-h-28 border-2 text-[22px]'
  } ${
    blocked
      ? 'border-dashed border-pine-soft bg-curtain-deep text-pine-soft'
      : `bg-paper hover:border-care hover:bg-care-tint ${large ? 'border-pine' : 'border-line'}`
  }`

type Blocked = Partial<Record<QuickTile, string>>

/**
 * `large` (low-vision layout, US-4): two columns, bigger targets and text, high-contrast borders.
 * `blocked` (US-5): tiles the patient's profile rules out, e.g. drinks while NPO. They stay
 * focusable and tappable (aria-disabled, not disabled) so tapping explains why.
 */
export function RequestTiles({
  t,
  busy,
  onTap,
  large = false,
  blocked = {},
  onBlocked,
}: {
  t: Strings
  busy: boolean
  onTap: (tile: QuickTile) => void
  large?: boolean
  blocked?: Blocked
  onBlocked?: (reason: string) => void
}) {
  const iconClass = large ? 'text-[56px]' : 'text-[36px]'
  const [open, setOpen] = useState<TileGroupKey | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const group = MAIN_TILES.find((m) => m.kind === 'group' && m.key === open)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (open) headingRef.current?.focus()
  }, [open])

  function explain(reason: string) {
    setNotice(reason)
    onBlocked?.(reason)
  }

  function tile(key: string, icon: string, label: string, reason: string | undefined, onPress: () => void) {
    return (
      <li key={key}>
        <button
          type="button"
          disabled={busy}
          aria-disabled={reason ? true : undefined}
          data-blocked={reason ? 'true' : undefined}
          onClick={() => {
            if (reason) explain(reason)
            else {
              setNotice(null)
              onPress()
            }
          }}
          className={tileClass(large, !!reason)}
        >
          <span aria-hidden="true" className={iconClass}>
            {reason ? '🚫' : icon}
          </span>
          {label}
        </button>
      </li>
    )
  }

  const noticeBox = notice && (
    <p role="alert" data-testid="tile-notice" className="mt-4 rounded-2xl bg-wait-tint p-4 font-bold text-pine">
      {notice}
    </p>
  )

  if (group?.kind === 'group') {
    return (
      <section aria-labelledby="tile-group-title" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="tile-group-title" ref={headingRef} tabIndex={-1} className="text-[26px] font-bold">
            <span aria-hidden="true">{group.icon} </span>
            {t.tileGroups[group.key]}
          </h2>
          <button
            type="button"
            onClick={() => {
              setNotice(null)
              setOpen(null)
            }}
            className="min-h-16 rounded-2xl border-2 border-pine bg-paper px-6 font-bold"
          >
            <span aria-hidden="true">← </span>
            {t.back}
          </button>
        </div>
        <ul className={`mt-3 grid grid-cols-2 ${large ? 'gap-4' : 'gap-3 md:grid-cols-4'}`}>
          {group.items.map((item) => tile(item.key, item.icon, t.tiles[item.key], blocked[item.key], () => onTap(item.key)))}
        </ul>
        {noticeBox}
      </section>
    )
  }

  return (
    <>
      <h2 className="mt-8 text-[26px] font-bold">{t.quickTitle}</h2>
      <ul className={`mt-3 grid grid-cols-2 ${large ? 'gap-4' : 'gap-3 md:grid-cols-3'}`}>
        {MAIN_TILES.map((m) => {
          if (m.kind === 'tile') return tile(m.key, m.icon, t.tiles[m.key], blocked[m.key], () => onTap(m.key))
          // A group is blocked only when every choice in it is (Thirsty while NPO, not Food & medication).
          const reasons = m.items.map((i) => blocked[i.key])
          const reason = reasons.every(Boolean) ? reasons[0] : undefined
          return tile(m.key, m.icon, t.tileGroups[m.key], reason, () => {
            setNotice(null)
            setOpen(m.key)
          })
        })}
      </ul>
      {noticeBox}
    </>
  )
}
