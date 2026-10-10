import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Confirmation } from '../components/patient/Confirmation'
import { InputPanel } from '../components/patient/InputPanel'
import { IntakeForm } from '../components/patient/IntakeForm'
import { EmergencyButton } from '../components/patient/EmergencyButton'
import { PatientHeader } from '../components/patient/PatientHeader'
import { PersonalTiles } from '../components/patient/PersonalTiles'
import { RequestsPanel } from '../components/patient/RequestsPanel'
import type { QuickTile } from '../components/patient/RequestTiles'
import { Screensaver } from '../components/patient/Screensaver'
import { VoiceBubble } from '../components/patient/VoiceBubble'
import { useAudioPrefs } from '../hooks/useAudioPrefs'
import { useIdle } from '../hooks/useIdle'
import * as waitingMusic from '../lib/waitingMusic'
import { requestLabel } from '../components/patient/RequestTracker'
import { useLiveTickets } from '../hooks/useLiveTickets'
import { DASHBOARD } from '../i18n/dashboard'
import { HTML_LANG, STRINGS } from '../i18n/strings'
import { layoutFor } from '../lib/accessibility'
import { api, ApiError } from '../lib/api'
import { DEFAULT_ROOM, IDLE_MS } from '../lib/config'
import { topTiles } from '../lib/personalize'
import { blockedTiles, profileRefusalMessage } from '../components/patient/profileRules'
import { speak } from '../lib/speak'
import {
  CLOSED_STATUSES,
  type CreateRequestResponse,
  type InputMode,
  type Language,
  type PatientTicketView,
  type Room,
  type TicketEvent,
} from '../types/ticket'

/** Room-channel events carry the patient view (no free text); keep only its fields. */
function toView(e: TicketEvent): PatientTicketView {
  const t = e.ticket
  return {
    ticket_id: t.ticket_id,
    department: t.department,
    category: t.category,
    tile: t.tile,
    priority: t.priority,
    status: t.status,
    patient_confirmation: t.patient_confirmation,
    created_at: t.created_at,
    eta_minutes: t.eta_minutes,
    history: t.history,
  }
}

/** Bedside screen: the intake form until it is filled in, then the patient's own dashboard. */
export default function PatientPage() {
  const { roomId = DEFAULT_ROOM } = useParams()
  const [room, setRoom] = useState<Room | null>(null)
  const [roomError, setRoomError] = useState(false)
  const [lang, setLang] = useState<Language>('en')

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

  if (roomError) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center text-2xl">
        <p role="alert">{STRINGS[lang].unknownRoom}</p>
      </main>
    )
  }
  if (!room) return null
  // Only an explicit false: rooms from before the intake feature are already set up.
  if (room.intake_complete === false) {
    return (
      <IntakeForm
        roomId={roomId}
        lang={lang}
        onLangChange={setLang}
        onDone={(r) => {
          setRoom(r)
          setLang(r.preferred_language)
        }}
      />
    )
  }
  // Keyed by intake time: a new patient on this tablet gets a completely fresh dashboard.
  return (
    <Dashboard
      key={room.intake_at ?? 'seeded'}
      room={room}
      lang={lang}
      onLangChange={setLang}
      onStartOver={() => void api.resetIntake(roomId).then(setRoom)}
    />
  )
}

function Dashboard({
  room,
  lang,
  onLangChange,
  onStartOver,
}: {
  room: Room
  lang: Language
  onLangChange: (l: Language) => void
  onStartOver: () => void
}) {
  const roomId = room.room_id
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CreateRequestResponse | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const t = STRINGS[lang]
  const d = DASHBOARD[lang]
  const screensaver = useIdle(IDLE_MS, !busy && !panelOpen)
  const audio = room.profile?.dashboard === 'audio'
  const base = layoutFor(room.profile)
  const layout = audio ? { ...base, large: true, readAloud: true } : base

  const since = room.intake_at ?? ''
  const fetcher = useCallback(() => api.roomTickets(roomId), [roomId])
  const fromEvent = useCallback((e: TicketEvent) => (e.ticket.created_at >= since ? toView(e) : null), [since])
  const { items: requests } = useLiveTickets<PatientTicketView>({
    fetcher,
    channels: [`room:${roomId}`],
    enabled: true,
    fromEvent,
  })
  const openCount = requests.filter((r) => !CLOSED_STATUSES.includes(r.status)).length

  // US-7: waiting music while any request is open; spoken status changes. Both toggleable.
  const { prefs: audioPrefs, toggle: toggleAudio } = useAudioPrefs(roomId)
  useEffect(() => {
    if (audioPrefs.music && openCount > 0) waitingMusic.start()
    else waitingMusic.stop()
  }, [audioPrefs.music, openCount])
  useEffect(() => () => waitingMusic.stop(), [])
  const lastStatus = useRef<Map<string, string> | null>(null)
  useEffect(() => {
    const prev = lastStatus.current
    lastStatus.current = new Map(requests.map((r) => [r.ticket_id, r.status]))
    if (prev === null || !audioPrefs.voice) return // first load: nothing to announce
    const changes = requests
      .filter((r) => prev.has(r.ticket_id) && prev.get(r.ticket_id) !== r.status)
      .map((r) => `${requestLabel(r, t, lang)}: ${t.status[r.status]}`) // same words as on screen
    if (changes.length) speak(changes.join('. '), t.speechLang)
  }, [requests, audioPrefs.voice, t, lang])
  const { top } = useMemo(() => topTiles(room.profile, requests), [room.profile, requests])

  /** `spokenLabel`: what the patient pressed, read aloud with the result when read-aloud is on. */
  const send = useCallback(
    async (body: { text: string; input_mode: InputMode; tile?: string }, spokenLabel?: string): Promise<boolean> => {
      setBusy(true)
      setError(null)
      try {
        const isTap = body.input_mode === 'quick_tap'
        const res = await api.createRequest({ room_id: roomId, ...body, ...(isTap ? { language_hint: lang } : {}) })
        setResult(res)
        if (!isTap && res.confirmation_language !== lang) onLangChange(res.confirmation_language)
        if (layout.readAloud) {
          const said = spokenLabel ? `${spokenLabel}. ${res.confirmation}` : res.confirmation
          speak(said, STRINGS[res.confirmation_language].speechLang)
        }
        return true
      } catch (e) {
        // A profile refusal (409, e.g. water while NPO) carries a patient-language reason.
        const refusal = e instanceof ApiError ? profileRefusalMessage(e.status, e.message) : null
        const message = refusal ?? (e instanceof ApiError && e.status === 429 ? t.tooMany : t.sendFailed)
        setError(message)
        if (layout.readAloud) speak(message, t.speechLang)
        return false
      } finally {
        setBusy(false)
      }
    },
    [roomId, lang, layout.readAloud, onLangChange, t],
  )

  const callNurse = () => void send({ text: t.tiles.nurse, input_mode: 'quick_tap', tile: 'nurse' }, d.emergency)
  const tap = (tile: QuickTile) => void send({ text: t.tiles[tile], input_mode: 'quick_tap', tile }, t.tiles[tile])
  const sendVoice = useCallback((text: string) => void send({ text, input_mode: 'voice' }), [send])
  const closePanel = useCallback(() => setPanelOpen(false), [])

  // US-5: tiles the profile rules out; tapping one explains why (and reads it aloud).
  const blocked = useMemo(() => blockedTiles(room.profile, t), [room.profile, t])
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(id)
  }, [notice])
  const explainBlocked = (why: string) => {
    setNotice(why)
    if (layout.readAloud) speak(why, t.speechLang)
  }

  return (
    <div
      onPointerDownCapture={waitingMusic.prime}
      onKeyDownCapture={waitingMusic.prime}
      className={`min-h-screen leading-snug ${layout.large ? 'text-[30px]' : 'text-[24px]'}`} data-dashboard={audio ? 'audio' : 'standard'}>
      {screensaver.idle && (
        <Screensaver
          roomId={roomId}
          lang={lang}
          t={t}
          requests={requests}
          nurse={room.primary_nurse}
          onWake={screensaver.wake}
          onNurse={() => {
            screensaver.wake()
            callNurse()
          }}
        />
      )}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-5">
        {notice && (
          <p role="status" data-testid="blocked-notice" className="max-w-xl rounded-2xl bg-pine px-6 py-4 text-center text-[22px] font-bold text-white shadow-2xl">
            {notice}
          </p>
        )}
      </div>
      {panelOpen && <RequestsPanel requests={requests} roomId={roomId} lang={lang} t={t} onClose={closePanel} />}
      <PatientHeader
        name={room.patient_alias}
        age={room.age}
        roomId={roomId}
        audio={audioPrefs}
        onToggleAudio={toggleAudio}
        lang={lang}
        openCount={openCount}
        onLangChange={onLangChange}
        onOpenRequests={() => setPanelOpen(true)}
        onStartOver={onStartOver}
      />

      <main className="px-5 pb-10 pt-2 sm:px-8 lg:pb-0">
        {result ? (
          <Confirmation result={result} t={t} onDone={() => setResult(null)} />
        ) : (
          <div className="grid items-start gap-x-10 lg:h-[calc(100vh-7.5rem)] lg:grid-cols-[minmax(0,1fr)_26rem]">
            <div className="flex flex-col lg:h-full lg:overflow-y-auto lg:overscroll-contain lg:px-1">
              <EmergencyButton
                lang={lang}
                busy={busy}
                onConfirm={callNurse}
                onArm={(message) => layout.readAloud && speak(message, t.speechLang)}
              />
              {audio ? (
                <VoiceBubble t={t} lang={lang} busy={busy} onSend={sendVoice} />
              ) : (
                <InputPanel
                  t={t}
                  busy={busy}
                  onSubmit={(text, mode) => send({ text, input_mode: mode })}
                  showText={layout.showText}
                  showMic={layout.showMic}
                />
              )}
              {error && (
                <p role="alert" className="mt-4 rounded-2xl bg-bell-tint p-4 font-bold text-bell-deep">
                  {error}
                </p>
              )}
            </div>
            {/* Wide screens: the request column scrolls in place; the page itself doesn't move. */}
            <div className="lg:h-full lg:overflow-y-auto lg:overscroll-contain lg:px-2 lg:pb-4" data-testid="request-column">
              <PersonalTiles
                top={top}
                t={t}
                lang={lang}
                busy={busy}
                large={layout.large}
                onTap={tap}
                gender={room.gender}
                blocked={blocked}
                onBlocked={explainBlocked}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
