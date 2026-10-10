import { useEffect, useRef, useState } from 'react'
import { useSpeech } from '../../hooks/useSpeech'
import { DASHBOARD } from '../../i18n/dashboard'
import { MicIcon, StopIcon } from '../icons'
import type { Strings } from '../../i18n/strings'
import type { Language } from '../../types/ticket'

const SWIRL = 'conic-gradient(from 90deg, #0f6e66, #3b82f6, #a855f7, #ec4899, #f59e0b, #0f6e66)'

/**
 * Audio dashboard centrepiece (Siri-style): tap, speak, and the request is sent when you stop
 * talking. The read-aloud confirmation that follows says what was understood.
 */
export function VoiceBubble({
  t,
  lang,
  busy,
  onSend,
}: {
  t: Strings
  lang: Language
  busy: boolean
  onSend: (text: string) => void
}) {
  const d = DASHBOARD[lang]
  const [heard, setHeard] = useState('')
  const heardRef = useRef('')
  const speech = useSpeech(t.speechLang, (text) => {
    heardRef.current = text
    setHeard(text)
  })

  // Send once recognition stops with something heard.
  const wasListening = useRef(false)
  useEffect(() => {
    if (wasListening.current && !speech.listening && heardRef.current.trim()) {
      onSend(heardRef.current.trim().slice(0, 500))
      heardRef.current = ''
    }
    wasListening.current = speech.listening
  }, [speech.listening, onSend])

  if (!speech.supported) {
    return (
      <p role="status" className="mt-6 rounded-2xl bg-wait-tint p-4 text-center font-bold" data-testid="voice-unavailable">
        {d.voiceUnavailable}
      </p>
    )
  }

  const listening = speech.listening
  return (
    <section className="mt-6 flex flex-col items-center gap-4" data-testid="voice-bubble">
      <div className="relative grid size-64 place-items-center">
        <span
          aria-hidden="true"
          className={`absolute inset-0 rounded-full opacity-60 blur-2xl ${listening ? 'animate-pulse motion-reduce:animate-none' : ''}`}
          style={{ background: SWIRL }}
        />
        <button
          type="button"
          disabled={busy}
          aria-pressed={listening}
          aria-label={listening ? d.listening : d.tapToTalk}
          onClick={() => {
            if (listening) speech.stop()
            else {
              heardRef.current = ''
              setHeard('')
              speech.start()
            }
          }}
          className={`relative grid size-56 place-items-center rounded-full shadow-2xl transition-transform motion-reduce:transition-none ${
            listening ? 'scale-105' : 'hover:scale-[1.02]'
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute inset-0 rounded-full ${listening ? 'animate-spin motion-reduce:animate-none' : ''}`}
            style={{ background: SWIRL, animationDuration: '6s' }}
          />
          <span aria-hidden="true" className="relative grid size-28 place-items-center rounded-full bg-white/90 text-pine">
            {listening ? <StopIcon className="size-12" /> : <MicIcon className="size-14" />}
          </span>
        </button>
      </div>
      <p className="text-center text-[28px] font-bold" aria-live="polite">
        {listening ? d.listening : d.tapToTalk}
      </p>
      {heard && (
        <p className="max-w-[32ch] text-center text-[24px]" data-testid="voice-heard">
          <span className="text-pine-soft">{d.heard} </span>“{heard}”
        </p>
      )}
      {speech.failed && <p className="text-[20px] text-bell-deep">{t.micUnavailable}</p>}
    </section>
  )
}
