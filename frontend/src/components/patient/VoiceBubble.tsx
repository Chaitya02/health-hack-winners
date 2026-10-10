import { useEffect, useRef, useState } from 'react'
import { useSpeech } from '../../hooks/useSpeech'
import { DASHBOARD } from '../../i18n/dashboard'
import { SiriOrb } from './SiriOrb'
import type { Strings } from '../../i18n/strings'
import type { Language } from '../../types/ticket'

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
    <section className="mt-6 flex flex-1 flex-col items-center justify-center gap-4 py-4" data-testid="voice-bubble">
      <SiriOrb
        size="xl"
        listening={listening}
        disabled={busy}
        label={listening ? d.listening : d.tapToTalk}
        onClick={() => {
          if (listening) speech.stop()
          else {
            heardRef.current = ''
            setHeard('')
            speech.start()
          }
        }}
      />
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
