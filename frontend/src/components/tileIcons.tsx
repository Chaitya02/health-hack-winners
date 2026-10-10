import type { ReactNode } from 'react'

/**
 * Request-button icons in the Ting-ting line style (see icons.tsx): 24×24, 2px rounded strokes
 * in currentColor. One per quick-tap tile and per group in RequestTiles.
 */
const PATHS: Record<string, ReactNode> = {
  // Thirsty → water, ice
  thirsty: (
    <>
      <path d="M6 4h12l-1.6 15.2a1.5 1.5 0 0 1-1.5 1.3H9.1a1.5 1.5 0 0 1-1.5-1.3z" />
      <path d="M6.8 10h10.4" />
    </>
  ),
  water: <path d="M12 3.5c3.3 4.2 5.5 7.2 5.5 10.2a5.5 5.5 0 0 1-11 0c0-3 2.2-6 5.5-10.2z" />,
  ice: (
    <>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5 12 12l8-4.5" />
      <path d="M12 12v9" />
    </>
  ),
  // Comfort → pillow, blanket, temperature, TV
  comfort: (
    <>
      <path d="M4 9a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" />
      <path d="M8 10c1.3.8 2.6 1.2 4 1.2s2.7-.4 4-1.2" />
    </>
  ),
  pillow: (
    <>
      <path d="M4 9a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" />
      <path d="M8 10c1.3.8 2.6 1.2 4 1.2s2.7-.4 4-1.2" />
    </>
  ),
  blanket: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M3.5 10h17" />
      <path d="M7.5 14.5h9" />
    </>
  ),
  temperature: (
    <>
      <path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z" />
      <path d="M12 9.5v7" />
    </>
  ),
  tv: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M8.5 21h7" />
      <path d="M12 17v4" />
    </>
  ),
  // Food & medication → food, medication
  foodMeds: (
    <>
      <path d="M3 18h18" />
      <path d="M5 18a7 7 0 0 1 14 0" />
      <path d="M12 9V7" />
      <path d="M10.5 7h3" />
    </>
  ),
  food: (
    <>
      <path d="M3 18h18" />
      <path d="M5 18a7 7 0 0 1 14 0" />
      <path d="M12 9V7" />
      <path d="M10.5 7h3" />
    </>
  ),
  medication: (
    <g transform="rotate(-45 12 12)">
      <rect x="3" y="8.25" width="18" height="7.5" rx="3.75" />
      <path d="M12 8.25v7.5" />
      <path d="M12 8.25h5.25a3.75 3.75 0 0 1 0 7.5H12z" fill="currentColor" stroke="none" />
    </g>
  ),
  // Emotional support → family, someone to talk to, spiritual care
  emotional: <path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z" />,
  family: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9.5" r="2.5" />
      <path d="M15.6 14.4A4.5 4.5 0 0 1 21 19" />
    </>
  ),
  counseling: (
    <>
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9.5L5 20v-4.2A2 2 0 0 1 4 14z" />
      <path d="M8.5 10h.01M12 10h.01M15.5 10h.01" />
    </>
  ),
  spiritual: (
    <>
      <path d="M12 3c2 2.4 3 4 3 5.6a3 3 0 0 1-6 0C9 7 10 5.4 12 3z" />
      <rect x="9" y="12.5" width="6" height="8.5" rx="1" />
    </>
  ),
  // Help to the bathroom: neutral (toilet), or the patient's gender when given
  'bathroom-female': (
    <>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M12 8.5c-1.6 0-2.6 1-3 2.4L7 17h10l-2-6.1c-.4-1.4-1.4-2.4-3-2.4z" />
      <path d="M10.2 17v4M13.8 17v4" />
    </>
  ),
  'bathroom-male': (
    <>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M9 8.5h6a1 1 0 0 1 1 1V15h-1.6v6h-4.8v-6H8V9.5a1 1 0 0 1 1-1z" />
    </>
  ),
  bathroom: (
    <>
      <rect x="6.5" y="3" width="6" height="6.5" rx="1" />
      <path d="M4.5 9.5h15a6.5 6.5 0 0 1-6.5 6.5h-2a6.5 6.5 0 0 1-6.5-6.5z" />
      <path d="M9 16l-.8 5h7.6l-.8-5" />
    </>
  ),
}

export type Gender = 'female' | 'male' | 'unspecified'

/** Icon key for a tile; the bathroom follows the patient's gender when they gave one. */
export function iconFor(key: string, gender: Gender = 'unspecified'): string {
  return key === 'bathroom' && gender !== 'unspecified' ? `bathroom-${gender}` : key
}

const HAND = (
  <path d="M8 12.5V6.8a1.4 1.4 0 0 1 2.8 0V11m0-5.6V5a1.4 1.4 0 0 1 2.8 0v6m0-5.2a1.4 1.4 0 0 1 2.8 0V12m0-3.6a1.4 1.4 0 0 1 2.8 0v5.4a6 6 0 0 1-6 6h-.6a6 6 0 0 1-5-2.7l-2.3-3.5a1.4 1.4 0 0 1 2.3-1.6L8 13" />
)

/**
 * A tile's icon. The bathroom tile ("help to the bathroom") carries a small help sign, a raised
 * hand, so a short "Bathroom" label still reads as asking for help.
 */
export function TileGlyph({ tile, gender, className }: { tile: string; gender?: Gender; className: string }) {
  if (tile !== 'bathroom') return <TileIcon name={tile} className={className} />
  return (
    <span className="relative inline-block" data-help-badge>
      <TileIcon name={iconFor(tile, gender)} className={className} />
      <span className="absolute -bottom-1 -right-3 grid size-[55%] place-items-center rounded-full bg-care text-white ring-2 ring-paper">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
          className="size-[70%]"
          data-icon="help"
        >
          {HAND}
        </svg>
      </span>
    </span>
  )
}

export function TileIcon({ name, className = 'size-10' }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      data-icon={name}
    >
      {PATHS[name] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  )
}
