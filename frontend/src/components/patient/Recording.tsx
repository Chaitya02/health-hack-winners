import { useState } from 'react'
import { useNow } from '../../hooks/useNow'

/** While recording: a pulsing red dot, the time so far, and what to do next. */
export function Recording({ label }: { label: string }) {
  const [started] = useState(() => Date.now())
  const seconds = Math.max(0, Math.floor((useNow(500) - started) / 1000))
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-3" data-testid="recording">
      <span className="inline-flex items-center gap-2 tabular-nums text-bell-deep">
        <span aria-hidden="true" className="size-4 animate-pulse rounded-full bg-bell motion-reduce:animate-none" />
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
      </span>
      {label}
    </span>
  )
}
