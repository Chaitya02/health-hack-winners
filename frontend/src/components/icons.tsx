/**
 * Ting-ting line icons: 24×24 grid, rounded 2px strokes in currentColor, so they take the theme
 * colour of whatever they sit in (pine on paper, white on care/bell). Decorative: the button
 * around them carries the accessible name.
 */
type IconProps = { className?: string }

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
}

export function HomeIcon({ className = 'size-8' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9v10.5a1 1 0 0 0 1 1h3.5v-6h4v6h3.5a1 1 0 0 0 1-1V9" />
    </svg>
  )
}

export function BellIcon({ className = 'size-8' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
      <path d="M12 3v2" />
    </svg>
  )
}

export function MicIcon({ className = 'size-10' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
      <path d="M9 21h6" />
    </svg>
  )
}

export function StopIcon({ className = 'size-10' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor" />
    </svg>
  )
}

export function GlobeIcon({ className = 'size-6' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </svg>
  )
}

export function ChevronDownIcon({ className = 'size-6' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
