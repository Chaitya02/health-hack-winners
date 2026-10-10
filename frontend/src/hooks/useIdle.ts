import { useCallback, useEffect, useRef, useState } from 'react'

// Activity that keeps the screen awake. While idle, only keys wake it: a tap has to land on the
// screensaver itself, so it can never fall through and press a request tile underneath.
const ACTIVITY = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const

/** True after `timeoutMs` with no interaction. `enabled: false` (e.g. while sending) pauses it. */
export function useIdle(timeoutMs: number, enabled = true): { idle: boolean; wake: () => void } {
  const [idle, setIdle] = useState(false)
  const idleRef = useRef(false)
  const timer = useRef<number | undefined>(undefined)

  // Restart the countdown (no state change, so it is safe to call from an effect).
  const arm = useCallback(() => {
    window.clearTimeout(timer.current)
    if (!enabled) return
    timer.current = window.setTimeout(() => {
      idleRef.current = true
      setIdle(true)
    }, timeoutMs)
  }, [enabled, timeoutMs])

  const wake = useCallback(() => {
    idleRef.current = false
    setIdle(false)
    arm()
  }, [arm])

  useEffect(() => {
    arm()
    const onActivity = (e: Event) => {
      if (!idleRef.current || e.type === 'keydown') wake()
    }
    for (const type of ACTIVITY) window.addEventListener(type, onActivity, { capture: true, passive: true })
    return () => {
      window.clearTimeout(timer.current)
      for (const type of ACTIVITY) window.removeEventListener(type, onActivity, { capture: true })
    }
  }, [arm, wake])

  return { idle, wake }
}
