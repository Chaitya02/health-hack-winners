import type { Strings } from '../../i18n/strings'

/**
 * The red "I need my nurse" button. Safety rule: always rendered and never disabled, whatever the
 * profile, layout or another request in flight. The page debounces repeat presses instead.
 */
export function NurseButton({ t, onPress }: { t: Strings; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="mt-5 flex min-h-24 w-full items-center gap-5 rounded-3xl bg-bell px-6 py-4 text-left text-white shadow-[0_6px_0_var(--color-bell-deep)] active:translate-y-1 active:shadow-[0_2px_0_var(--color-bell-deep)]"
    >
      <span aria-hidden="true" className="grid size-16 shrink-0 place-items-center rounded-full bg-white text-[34px]">
        🔔
      </span>
      <span>
        <span className="block text-[30px] font-bold leading-tight">{t.tiles.nurse}</span>
        <span className="block text-[20px]">{t.nurseHint}</span>
      </span>
    </button>
  )
}
