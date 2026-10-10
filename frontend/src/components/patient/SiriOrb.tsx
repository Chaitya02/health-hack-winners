import { MicIcon, StopIcon } from '../icons'

const SWIRL = 'conic-gradient(from 90deg, #0f6e66, #3b82f6, #a855f7, #ec4899, #f59e0b, #0f6e66)'

const SIZES = {
  lg: { box: 'size-64', orb: 'size-56', core: 'size-28', mic: 'size-14', stop: 'size-12' },
  sm: { box: 'size-36', orb: 'size-32', core: 'size-16', mic: 'size-9', stop: 'size-8' },
}

/** The Siri-style voice orb (swirl spins and glows while listening), used by both dashboards. */
export function SiriOrb({
  listening,
  disabled,
  label,
  onClick,
  size = 'lg',
}: {
  listening: boolean
  disabled?: boolean
  label: string
  onClick: () => void
  size?: keyof typeof SIZES
}) {
  const s = SIZES[size]
  return (
    <div className={`relative grid shrink-0 place-items-center ${s.box}`}>
      <span
        aria-hidden="true"
        className={`absolute inset-0 rounded-full opacity-60 blur-2xl ${listening ? 'animate-pulse motion-reduce:animate-none' : ''}`}
        style={{ background: SWIRL }}
      />
      <button
        type="button"
        disabled={disabled}
        aria-pressed={listening}
        aria-label={label}
        onClick={onClick}
        className={`relative grid place-items-center rounded-full shadow-2xl transition-transform motion-reduce:transition-none ${s.orb} ${
          listening ? 'scale-105' : 'hover:scale-[1.03]'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute inset-0 rounded-full ${listening ? 'animate-spin motion-reduce:animate-none' : ''}`}
          style={{ background: SWIRL, animationDuration: '6s' }}
        />
        <span aria-hidden="true" className={`relative grid place-items-center rounded-full bg-white/90 text-pine ${s.core}`}>
          {listening ? <StopIcon className={s.stop} /> : <MicIcon className={s.mic} />}
        </span>
      </button>
    </div>
  )
}
