import { DASHBOARD } from '../../i18n/dashboard'
import { BellIcon, HomeIcon, MusicIcon, SpeakerIcon } from '../icons'
import { LanguageSelect } from './LanguageSelect'
import type { Language } from '../../types/ticket'

/** Dashboard header: the patient's name and age only, plus language, start over and the
 * requests bell (badge = open requests; opens the request history). */
export function PatientHeader({
  name,
  age,
  roomId,
  audio,
  onToggleAudio,
  lang,
  openCount,
  onLangChange,
  onOpenRequests,
  onStartOver,
}: {
  name: string
  age: number | null
  roomId: string
  /** US-7: spoken updates and waiting music on/off. */
  audio: { voice: boolean; music: boolean }
  onToggleAudio: (name: 'voice' | 'music') => void
  lang: Language
  openCount: number
  onLangChange: (l: Language) => void
  onOpenRequests: () => void
  onStartOver: () => void
}) {
  const d = DASHBOARD[lang]
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
      <h1 data-testid="patient-identity" className="leading-tight">
        <span className="text-[40px] font-bold">{name}</span>
        {age != null && <span className="text-[28px] text-pine-soft">, {d.ageYears(age)}</span>}
        <span className="text-[28px] text-pine-soft"> ({d.room(roomId)})</span>
      </h1>
      <div className="flex flex-wrap items-center gap-3">
        <LanguageSelect lang={lang} onChange={onLangChange} />
        <button
          type="button"
          aria-pressed={audio.voice}
          aria-label={d.voiceUpdates}
          title={d.voiceUpdates}
          onClick={() => onToggleAudio('voice')}
          data-testid="toggle-voice"
          className={`grid size-16 place-items-center rounded-2xl border-2 border-pine ${audio.voice ? 'bg-pine text-white' : 'bg-paper text-pine hover:bg-curtain'}`}
        >
          <SpeakerIcon className="size-8" off={!audio.voice} />
        </button>
        <button
          type="button"
          aria-pressed={audio.music}
          aria-label={d.waitingMusic}
          title={d.waitingMusic}
          onClick={() => onToggleAudio('music')}
          data-testid="toggle-music"
          className={`grid size-16 place-items-center rounded-2xl border-2 border-pine ${audio.music ? 'bg-pine text-white' : 'bg-paper text-pine hover:bg-curtain'}`}
        >
          <MusicIcon className="size-8" off={!audio.music} />
        </button>
        <button
          type="button"
          onClick={onStartOver}
          aria-label={d.startOver}
          title={d.startOver}
          data-testid="start-over"
          className="grid size-16 place-items-center rounded-2xl border-2 border-pine bg-paper text-pine hover:bg-curtain"
        >
          <HomeIcon />
        </button>
        <button
          type="button"
          onClick={onOpenRequests}
          aria-label={`${d.requests}: ${d.openCount(openCount)}`}
          data-testid="requests-bell"
          title={d.requests}
          className="relative grid size-16 place-items-center rounded-2xl border-2 border-pine bg-paper text-pine hover:bg-curtain"
        >
          <BellIcon />
          {openCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-2 -top-2 grid min-w-8 place-items-center rounded-full bg-bell px-2 text-[18px] font-bold tabular-nums text-white"
            >
              {openCount}
            </span>
          )}
        </button>
      </div>
    </header>
  )
}
