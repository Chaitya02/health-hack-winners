import { useCallback, useEffect, useRef, useState } from 'react'

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

/** Browser speech-to-text in the patient's language. Text input always remains available. */
export function useSpeech(lang: string, onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [failed, setFailed] = useState(false)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const supported = getCtor() !== null
  const onTextRef = useRef(onText)
  useEffect(() => {
    onTextRef.current = onText
  })

  const stop = useCallback(() => {
    recRef.current?.stop()
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const SR = getCtor()
    if (!SR) {
      setFailed(true)
      return
    }
    const rec = new SR()
    rec.lang = lang
    rec.interimResults = true
    rec.continuous = false
    rec.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(' ')
      onTextRef.current(text)
    }
    rec.onerror = (e) => {
      if (e.error !== 'aborted' && e.error !== 'no-speech') setFailed(true)
      setListening(false)
    }
    rec.onend = () => setListening(false)
    recRef.current = rec
    setFailed(false)
    try {
      rec.start()
      setListening(true)
    } catch {
      setFailed(true)
    }
  }, [lang])

  useEffect(() => () => recRef.current?.stop(), [])

  return { supported, listening, failed, start, stop }
}
