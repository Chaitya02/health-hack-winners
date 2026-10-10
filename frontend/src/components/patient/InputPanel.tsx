import { useState, type FormEvent } from 'react'
import { useSpeech } from '../../hooks/useSpeech'
import type { Strings } from '../../i18n/strings'
import type { InputMode } from '../../types/ticket'

/**
 * Voice + free-text input. Owns its draft text; calls onSubmit with the trimmed request.
 * showText / showMic come from the patient's accessibility layout (US-4); with the text box
 * hidden, what the mic heard is shown read-only with a Send button.
 */
export function InputPanel({
  t,
  busy,
  onSubmit,
  showText = true,
  showMic = true,
}: {
  t: Strings
  busy: boolean
  onSubmit: (text: string, mode: InputMode) => Promise<boolean>
  showText?: boolean
  showMic?: boolean
}) {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<InputMode>('text')

  const speech = useSpeech(t.speechLang, (spoken) => {
    setText(spoken)
    setMode('voice')
  })

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (speech.listening) speech.stop()
    const trimmed = text.trim()
    if (!trimmed) return
    if (await onSubmit(trimmed.slice(0, 500), mode)) {
      setText('')
      setMode('text')
    }
  }

  const mic = showMic && speech.supported
  if (!showText && !mic) return null

  return (
    <>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-stretch">
        {mic && (
          <button
            type="button"
            onClick={speech.listening ? speech.stop : speech.start}
            aria-pressed={speech.listening}
            className={`flex min-h-24 shrink-0 items-center justify-center gap-3 rounded-3xl px-6 font-bold sm:w-48 sm:flex-col ${
              speech.listening ? 'bg-pine text-white' : 'bg-care text-white hover:bg-care-deep'
            }`}
          >
            <span aria-hidden="true" className="text-[40px]">
              {speech.listening ? '◼' : '🎙️'}
            </span>
            <span className="text-[22px]">{speech.listening ? t.micStop : t.micStart}</span>
          </button>
        )}
        <div className="flex flex-1 flex-col gap-3">
          {showText ? (
            <>
              <label htmlFor="request-text" className="font-bold">
                {t.typeLabel}
              </label>
              <textarea
                id="request-text"
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  setMode('text')
                }}
                maxLength={500}
                rows={2}
                placeholder={t.placeholder}
                className="min-h-24 w-full rounded-2xl border-2 border-pine bg-paper p-4 text-[24px] placeholder:text-pine-soft"
              />
            </>
          ) : (
            <p
              aria-live="polite"
              data-testid="voice-transcript"
              className="flex min-h-24 items-center rounded-2xl border-4 border-pine bg-paper p-4 text-[30px] font-bold"
            >
              {text || <span className="font-normal text-pine-soft">{t.micStart}</span>}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="min-h-16 rounded-2xl bg-pine px-6 font-bold text-white disabled:bg-curtain-deep disabled:text-pine-soft"
          >
            {busy ? t.sending : t.send}
          </button>
        </div>
      </form>
      {showMic && (speech.failed || !speech.supported) && <p className="mt-3 text-[20px] text-pine-soft">{t.micUnavailable}</p>}
    </>
  )
}
