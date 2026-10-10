import { useCallback, useEffect, useRef, useState } from 'react'
import * as waitingMusic from '../lib/waitingMusic'

// Minimal Web Speech API typings (not in lib.dom for all browsers).
interface SpeechResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}
interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: SpeechResultEvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start(): void
  stop(): void
}
type Ctor = new () => SpeechRecognitionLike

function getCtor(): Ctor | null {
  const w = globalThis as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** While recording nothing else plays: waiting music is silenced and read-aloud is cut off, so
 * the microphone only hears the patient. */
function quiet(on: boolean) {
  waitingMusic.mute(on)
  if (on) globalThis.speechSynthesis?.cancel()
}

/**
 * Browser speech-to-text in the patient's language, as a recorder: start() records until stop(),
 * through pauses (browsers end a session when the speaker pauses; it is restarted and the words
 * so far are kept). The consumer sends what was heard when the patient taps to stop.
 * Text input always remains available.
 */
export function useSpeech(lang: string, onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [failed, setFailed] = useState(false)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const supported = getCtor() !== null
  const onTextRef = useRef(onText)
  useEffect(() => {
    onTextRef.current = onText
  })
  const recording = useRef(false) // true from start() until stop()
  const heard = useRef('') // everything heard since start(), across restarts
  const restart = useRef<() => void>(() => undefined)

  const session = useCallback(() => {
    const SR = getCtor()
    if (!SR) {
      recording.current = false
      setFailed(true)
      setListening(false)
      return
    }
    const rec = new SR()
    rec.lang = lang
    rec.interimResults = true
    rec.continuous = true
    const before = heard.current
    rec.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(' ')
      heard.current = [before, text].filter(Boolean).join(' ')
      onTextRef.current(heard.current)
    }
    rec.onerror = (e) => {
      if (e.error === 'aborted' || e.error === 'no-speech') return // onend follows
      recording.current = false
      setFailed(true)
      setListening(false)
      quiet(false)
    }
    rec.onend = () => {
      if (recording.current) restart.current() // a pause, not the patient: keep recording
      else setListening(false)
    }
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      recording.current = false
      setFailed(true)
      setListening(false)
    }
  }, [lang])

  useEffect(() => {
    restart.current = session
  }, [session])

  const start = useCallback(() => {
    recording.current = true
    heard.current = ''
    setFailed(false)
    quiet(true)
    session()
  }, [session])

  const stop = useCallback(() => {
    recording.current = false
    recRef.current?.stop()
    setListening(false)
    quiet(false)
  }, [])

  useEffect(
    () => () => {
      recording.current = false
      recRef.current?.stop()
      waitingMusic.mute(false)
    },
    [],
  )

  return { supported, listening, failed, start, stop }
}
