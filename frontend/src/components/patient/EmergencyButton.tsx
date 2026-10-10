import { useEffect, useState } from 'react'
import { DASHBOARD } from '../../i18n/dashboard'
import type { Language } from '../../types/ticket'

const ARMED_MS = 10_000

/**
 * The red "Emergency" button (calls the nurse as urgent). Two taps on the same button: the first
 * shows a toast and arms it, the second within 10 s sends, so a brush of the hand doesn't page
 * the nurse. Safety rule: always rendered and enabled on the patient screen.
 */
export function EmergencyButton({
  lang,
  busy,
  onConfirm,
  onArm,
}: {
  lang: Language
  busy: boolean
  onConfirm: () => void
  /** Called on the first tap with the toast text (e.g. to read it aloud). */
  onArm?: (message: string) => void
}) {
  const d = DASHBOARD[lang]
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), ARMED_MS)
    return () => clearTimeout(timer)
  }, [armed])

  return (
    <>
      <button
        type="button"
        disabled={busy}
        data-armed={armed}
        onClick={() => {
          if (armed) {
            setArmed(false)
            onConfirm()
          } else {
            setArmed(true)
            onArm?.(d.emergencyAgain)
          }
        }}
        className={`mt-5 flex min-h-24 w-full items-center justify-center rounded-3xl bg-bell px-6 py-4 text-[36px] font-bold text-white shadow-[0_6px_0_var(--color-bell-deep)] active:translate-y-1 active:shadow-[0_2px_0_var(--color-bell-deep)] ${
          armed ? 'ring-8 ring-bell/30 motion-safe:animate-pulse' : ''
        }`}
      >
        {d.emergency}
      </button>
      <div aria-live="assertive" className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-5">
        {armed && (
          <p role="status" data-testid="emergency-toast" className="rounded-2xl bg-pine px-6 py-4 text-center text-[24px] font-bold text-white shadow-2xl">
            {d.emergencyAgain}
          </p>
        )}
      </div>
    </>
  )
}
