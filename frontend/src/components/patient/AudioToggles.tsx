import { AUDIO } from '../../i18n/audio'
import type { Language } from '../../types/ticket'

/** Voice and music on/off (US-7). Each is a toggle button: aria-pressed carries the state. */
export function AudioToggles({
  lang,
  voice,
  music,
  onChange,
}: {
  lang: Language
  voice: boolean
  music: boolean
  onChange: (name: 'voice' | 'music', value: boolean) => void
}) {
  const s = AUDIO[lang]
  const toggle = (name: 'voice' | 'music', on: boolean, icon: string, label: string) => (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(name, !on)}
      className={`flex min-h-16 items-center gap-3 rounded-2xl border-2 px-4 text-[20px] font-bold ${
        on ? 'border-care bg-care-tint text-care-deep' : 'border-line bg-paper text-pine-soft'
      }`}
    >
      <span aria-hidden="true" className="text-[26px]">
        {icon}
      </span>
      {label}
      <span aria-hidden="true" className={`rounded-full px-3 py-0.5 text-[18px] ${on ? 'bg-care text-white' : 'bg-curtain-deep'}`}>
        {on ? s.on : s.off}
      </span>
    </button>
  )
  return (
    <div role="group" aria-label={s.sound} className="mt-6 flex flex-wrap gap-3" data-testid="audio-toggles">
      {toggle('voice', voice, voice ? '🔊' : '🔈', s.voice)}
      {toggle('music', music, '🎵', s.music)}
    </div>
  )
}
