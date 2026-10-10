import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useLiveTickets } from '../hooks/useLiveTickets'
import { useSpeech } from '../hooks/useSpeech'
import { HTML_LANG, STRINGS, type Strings, type TileKey } from '../i18n/strings'
import { api, ApiError } from '../lib/api'
import type {
  CreateRequestResponse,
  InputMode,
  Language,
  PatientTicketView,
  Room,
  TicketEvent,
} from '../types/ticket'
import { LANGUAGES } from '../types/ticket'

const TILES: { key: Exclude<TileKey, 'nurse'>; icon: string }[] = [
  { key: 'water', icon: '💧' },
  { key: 'ice', icon: '🧊' },
  { key: 'pillow', icon: '🛏️' },
  { key: 'blanket', icon: '🧣' },
  { key: 'bathroom', icon: '🚻' },
  { key: 'temperature', icon: '🌡️' },
  { key: 'tv', icon: '📺' },
  { key: 'food', icon: '🍽️' },
]

const STATUS_STYLE: Record<string, string> = {
  NEW: 'bg-curtain-deep text-pine',
  ACKNOWLEDGED: 'bg-care-tint text-care-deep',
  IN_PROGRESS: 'bg-care text-white',
  RESOLVED: 'bg-fresh-tint text-fresh',
  ESCALATED: 'bg-bell-tint text-bell-deep',
}

function toView(e: TicketEvent): PatientTicketView {
  const t = e.ticket
  return {
    ticket_id: t.ticket_id,
    department: t.department,
    category: t.category,
    priority: t.priority,
    status: t.status,
    english_summary: t.english_summary,
    patient_confirmation: t.patient_confirmation,
    created_at: t.created_at,
    eta_minutes: t.eta_minutes,
    history: t.history,
  }
}

export default function PatientPage() {
  const { roomId = '' } = useParams()
  const [room, setRoom] = useState<Room | null>(null)
  const [roomError, setRoomError] = useState(false)
  const [lang, setLang] = useState<Language>('en')
  const [text, setText] = useState('')
  const [mode, setMode] = useState<InputMode>('text')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CreateRequestResponse | null>(null)
  const t = STRINGS[lang]

  useEffect(() => {
    api
      .room(roomId)
      .then((r) => {
        setRoom(r)
        setLang(r.preferred_language)
      })
      .catch(() => setRoomError(true))
  }, [roomId])

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang]
  }, [lang])

  const fetcher = useCallback(() => api.roomTickets(roomId), [roomId])
  const { items: requests } = useLiveTickets<PatientTicketView>({
    fetcher,
    channels: [`room:${roomId}`],
    enabled: room !== null,
    fromEvent: toView,
  })

  const speech = useSpeech(t.speechLang, (spoken) => {
    setText(spoken)
    setMode('voice')
  })

  async function send(body: { text: string; input_mode: InputMode; tile?: string }) {
    setBusy(true)
    setError(null)
    try {
      const isTap = body.input_mode === 'quick_tap'
      const res = await api.createRequest({
        room_id: roomId,
        ...body,
        ...(isTap ? { language_hint: lang } : {}),
      })
      setResult(res)
      if (!isTap && res.confirmation_language !== lang) setLang(res.confirmation_language)
      setText('')
      setMode('text')
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429 ? t.tooMany : t.sendFailed)
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (speech.listening) speech.stop()
    const trimmed = text.trim()
    if (trimmed) void send({ text: trimmed.slice(0, 500), input_mode: mode })
  }

  if (roomError) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center text-2xl">
        <p role="alert">{t.unknownRoom}</p>
      </main>
    )
  }

  const sorted = [...requests].sort((a, b) => b.created_at.localeCompare(a.created_at))

  return (
    <div className="min-h-screen text-[24px] leading-snug">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-line bg-paper px-5 py-4 sm:px-8">
        <div className="flex items-center gap-4">
          <span
            className="rounded-2xl bg-pine px-4 py-2 text-[28px] font-bold tabular-nums text-white"
            aria-label={`Room ${roomId}`}
          >
            {roomId}
          </span>
          <span className="text-[20px] text-pine-soft">{room?.unit ?? ''}</span>
        </div>
        <label className="flex items-center gap-3 text-[20px]">
          <span>{t.language}</span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Language)}
            className="min-h-16 rounded-xl border-2 border-pine bg-paper px-4 text-[22px]"
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l} lang={HTML_LANG[l]}>
                {STRINGS[l].languageName}
              </option>
            ))}
          </select>
        </label>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-10 pt-6 sm:px-8">
        {result ? (
          <Confirmation result={result} t={t} onDone={() => setResult(null)} />
        ) : (
          <>
            <h1 className="text-[34px] font-bold leading-tight sm:text-[40px]">
              {t.greeting(room?.patient_alias ?? '')}
            </h1>
            <p className="mt-2 max-w-[38ch] text-pine-soft">{t.prompt}</p>

            <button
              type="button"
              disabled={busy}
              onClick={() => void send({ text: t.tiles.nurse, input_mode: 'quick_tap', tile: 'nurse' })}
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

            <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-stretch">
              {speech.supported && (
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
                <button
                  type="submit"
                  disabled={busy || !text.trim()}
                  className="min-h-16 rounded-2xl bg-pine px-6 font-bold text-white disabled:bg-curtain-deep disabled:text-pine-soft"
                >
                  {busy ? t.sending : t.send}
                </button>
              </div>
            </form>
            {(speech.failed || !speech.supported) && (
              <p className="mt-3 text-[20px] text-pine-soft">{t.micUnavailable}</p>
            )}
            {error && (
              <p role="alert" className="mt-4 rounded-2xl bg-bell-tint p-4 font-bold text-bell-deep">
                {error}
              </p>
            )}

            <h2 className="mt-8 text-[26px] font-bold">{t.quickTitle}</h2>
            <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {TILES.map((tile) => (
                <li key={tile.key}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void send({ text: t.tiles[tile.key], input_mode: 'quick_tap', tile: tile.key })}
                    className="flex min-h-28 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-line bg-paper p-3 text-center text-[22px] font-bold hover:border-care hover:bg-care-tint"
                  >
                    <span aria-hidden="true" className="text-[36px]">
                      {tile.icon}
                    </span>
                    {t.tiles[tile.key]}
                  </button>
                </li>
              ))}
            </ul>

          </>
        )}

        <section aria-labelledby="my-requests" className="mt-10">
          <h2 id="my-requests" className="text-[26px] font-bold">
            {t.yourRequests}
          </h2>
          {sorted.length === 0 ? (
            <p className="mt-2 text-pine-soft">{t.noRequests}</p>
          ) : (
            <ul className="mt-3 divide-y-2 divide-line rounded-2xl border-2 border-line bg-paper" aria-live="polite">
              {sorted.map((r) => (
                <li key={r.ticket_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" data-testid="patient-request">
                  <span className="font-bold">{t.departments[r.department]}</span>
                  <span className={`rounded-full px-4 py-1 text-[20px] font-bold ${STATUS_STYLE[r.status]}`}>
                    {t.status[r.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}

function Confirmation({
  result,
  t,
  onDone,
}: {
  result: CreateRequestResponse
  t: Strings
  onDone: () => void
}) {
  const clinical = result.is_clinical
  return (
    <section
      role="status"
      aria-live="assertive"
      data-testid="confirmation"
      className={`rounded-3xl p-8 text-center ${clinical ? 'bg-bell text-white' : 'bg-care-tint text-pine'}`}
    >
      <p aria-hidden="true" className="text-[64px]">
        {clinical ? '🔔' : '✓'}
      </p>
      <p className="mx-auto max-w-[28ch] text-[34px] font-bold leading-tight" lang={HTML_LANG[result.confirmation_language]}>
        {result.confirmation}
      </p>
      <button
        type="button"
        onClick={onDone}
        className={`mt-8 min-h-16 rounded-2xl px-8 font-bold ${
          clinical ? 'bg-white text-bell-deep' : 'bg-pine text-white'
        }`}
      >
        {t.newRequest}
      </button>
    </section>
  )
}
