import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Confirmation } from '../components/patient/Confirmation'
import { Header } from '../components/patient/Header'
import { InputPanel } from '../components/patient/InputPanel'
import { MyRequests } from '../components/patient/MyRequests'
import { NurseButton } from '../components/patient/NurseButton'
import { RequestTiles } from '../components/patient/RequestTiles'
import { Screensaver } from '../components/patient/Screensaver'
import { useIdle } from '../hooks/useIdle'
import { layoutFor } from '../lib/accessibility'
import { speak } from '../lib/speak'
import { useLiveTickets } from '../hooks/useLiveTickets'
import { HTML_LANG, STRINGS } from '../i18n/strings'
import { api, ApiError } from '../lib/api'
import { DEFAULT_ROOM, IDLE_MS } from '../lib/config'
import type {
  CreateRequestResponse,
  InputMode,
  Language,
  PatientTicketView,
  Room,
  TicketEvent,
} from '../types/ticket'

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
  const { roomId = DEFAULT_ROOM } = useParams()
  const [room, setRoom] = useState<Room | null>(null)
  const [roomError, setRoomError] = useState(false)
  const [lang, setLang] = useState<Language>('en')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CreateRequestResponse | null>(null)
  const t = STRINGS[lang]
  const screensaver = useIdle(IDLE_MS, !busy)
  const layout = layoutFor(room?.profile)

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

  /** Returns true when the request was accepted. */
  /** `spokenLabel`: what the patient pressed, read aloud with the result in the low-vision layout. */
  async function send(
    body: { text: string; input_mode: InputMode; tile?: string },
    spokenLabel?: string,
  ): Promise<boolean> {
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
      if (layout.readAloud) {
        const said = spokenLabel ? `${spokenLabel}. ${res.confirmation}` : res.confirmation
        speak(said, STRINGS[res.confirmation_language].speechLang)
      }
      return true
    } catch (e) {
      const message = e instanceof ApiError && e.status === 429 ? t.tooMany : t.sendFailed
      setError(message)
      if (layout.readAloud) speak(message, t.speechLang)
      return false
    } finally {
      setBusy(false)
    }
  }

  if (roomError) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center text-2xl">
        <p role="alert">{t.unknownRoom}</p>
      </main>
    )
  }

  const callNurse = () => void send({ text: t.tiles.nurse, input_mode: 'quick_tap', tile: 'nurse' }, t.tiles.nurse)

  return (
    <div className={`min-h-screen leading-snug ${layout.large ? 'text-[30px]' : 'text-[24px]'}`}>
      {screensaver.idle && (
        <Screensaver
          roomId={roomId}
          lang={lang}
          t={t}
          requests={requests}
          onWake={screensaver.wake}
          onNurse={() => {
            screensaver.wake()
            callNurse()
          }}
        />
      )}
      <Header roomId={roomId} unit={room?.unit ?? ''} lang={lang} t={t} onLangChange={setLang} />

      <main className="mx-auto max-w-5xl px-5 pb-10 pt-6 sm:px-8">
        {result ? (
          <Confirmation result={result} t={t} onDone={() => setResult(null)} />
        ) : (
          <>
            <h1 className="text-[34px] font-bold leading-tight sm:text-[40px]">
              {t.greeting(room?.patient_alias ?? '')}
            </h1>
            <p className="mt-2 max-w-[38ch] text-pine-soft">{t.prompt}</p>

            <NurseButton
              t={t}
              busy={busy}
              onPress={callNurse}
            />

            <InputPanel
              t={t}
              busy={busy}
              onSubmit={(text, mode) => send({ text, input_mode: mode })}
              showText={layout.showText}
              showMic={layout.showMic}
            />
            {error && (
              <p role="alert" className="mt-4 rounded-2xl bg-bell-tint p-4 font-bold text-bell-deep">
                {error}
              </p>
            )}

            <RequestTiles
              t={t}
              busy={busy}
              large={layout.large}
              onTap={(tile) => void send({ text: t.tiles[tile], input_mode: 'quick_tap', tile }, t.tiles[tile])}
            />
          </>
        )}

        <MyRequests requests={requests} t={t} />
      </main>
    </div>
  )
}
