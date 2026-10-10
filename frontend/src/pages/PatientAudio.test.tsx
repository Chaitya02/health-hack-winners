import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAudioPrefs } from '../hooks/useAudioPrefs'
import { AUDIO } from '../i18n/audio'
import { startMusic, stopMusic } from '../lib/waitingMusic'
import { mockFetch, ticket } from '../test/fixtures'
import { FakeWebSocket } from '../test/setup'
import type { Ticket } from '../types/ticket'
import PatientPage from './PatientPage'

// US-7: spoken status updates and waiting music on the real patient page.

vi.mock('../lib/waitingMusic', () => ({ startMusic: vi.fn(), stopMusic: vi.fn(), isMusicPlaying: vi.fn() }))

const spoken: string[] = []

beforeEach(() => {
  spoken.length = 0
  localStorage.clear()
  vi.mocked(startMusic).mockClear()
  vi.mocked(stopMusic).mockClear()
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      text: string
      lang = ''
      rate = 1
      constructor(text: string) {
        this.text = text
      }
    },
  )
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: (u: { text: string }) => spoken.push(u.text) })
})

let roomSeq = 0

function renderRoom({ lowVision = false, tickets = [] as Ticket[] } = {}) {
  const roomId = `5${String(roomSeq++).padStart(2, '0')}`
  mockFetch({
    [`GET /api/rooms/${roomId}/tickets`]: tickets.map((t) => ({ ...t, room_id: roomId })),
    [`GET /api/rooms/${roomId}`]: {
      room_id: roomId,
      unit: '4 West Med-Surg',
      patient_alias: 'Ana',
      preferred_language: 'en',
      primary_nurse: 'N',
      profile: {
        npo: false,
        npo_reason: null,
        fall_risk: false,
        diet: null,
        attendant_preference: 'any',
        accessibility: { low_vision: lowVision, speech_difficulty: false, cannot_write: false },
      },
    },
  })
  const view = render(
    <MemoryRouter initialEntries={[`/patient/${roomId}`]}>
      <Routes>
        <Route path="/patient/:roomId" element={<PatientPage />} />
      </Routes>
    </MemoryRouter>,
  )
  return { roomId, view }
}

async function liveSocket(roomId: string) {
  await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0))
  const ws = FakeWebSocket.instances.at(-1)!
  act(() => {
    ws.open()
    ws.emit({ type: 'subscribed', channels: [`room:${roomId}`] })
  })
  return ws
}

const voiceSwitch = () => screen.getByRole('button', { name: /read updates aloud/i })
const musicSwitch = () => screen.getByRole('button', { name: /waiting music/i })
const pillow = (over: Partial<Ticket> = {}) => ticket({ ticket_id: 't_p', tile: 'pillow', ...over })

describe('Audio switches (US-7)', () => {
  it('voice and music are off by default and the nurse button is unaffected', async () => {
    renderRoom()
    await screen.findByRole('heading', { name: /hi ana/i })
    expect(voiceSwitch()).toHaveAttribute('aria-pressed', 'false')
    expect(musicSwitch()).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /i need my nurse/i })).toBeEnabled()
  })

  it('voice defaults on for a low-vision profile', async () => {
    renderRoom({ lowVision: true })
    await waitFor(() => expect(voiceSwitch()).toHaveAttribute('aria-pressed', 'true'))
  })

  it('choices are remembered per room in localStorage', async () => {
    const { roomId, view } = renderRoom()
    await screen.findByRole('heading', { name: /hi ana/i })
    await userEvent.click(musicSwitch())
    await userEvent.click(voiceSwitch())
    expect(JSON.parse(localStorage.getItem(`tingting.audio.${roomId}`)!)).toEqual({ music: true, voice: true })
    view.unmount()
    render(
      <MemoryRouter initialEntries={[`/patient/${roomId}`]}>
        <Routes>
          <Route path="/patient/:roomId" element={<PatientPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('button', { name: /waiting music/i })).toHaveAttribute('aria-pressed', 'true')
    expect(voiceSwitch()).toHaveAttribute('aria-pressed', 'true')
  })

  it('a low-vision patient can turn voice off, and that choice wins over the profile', async () => {
    const { roomId } = renderRoom({ lowVision: true })
    await waitFor(() => expect(voiceSwitch()).toHaveAttribute('aria-pressed', 'true'))
    await userEvent.click(voiceSwitch())
    expect(voiceSwitch()).toHaveAttribute('aria-pressed', 'false')
    expect(loadAudioPrefs(roomId)).toEqual({ voice: false })
  })

  it('still works for the session when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    renderRoom()
    await screen.findByRole('heading', { name: /hi ana/i })
    await userEvent.click(musicSwitch())
    expect(musicSwitch()).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('Spoken status updates (US-7)', () => {
  it('reads a status change aloud with exactly the label and status shown on screen', async () => {
    const { roomId } = renderRoom({ tickets: [pillow()] })
    await screen.findByTestId('patient-request')
    await userEvent.click(voiceSwitch())
    const ws = await liveSocket(roomId)
    act(() => ws.emit({ type: 'ticket.updated', ticket: pillow({ room_id: roomId, status: 'IN_PROGRESS' }), ts: '' }))
    await waitFor(() => expect(spoken).toEqual(['Pillow: On the way']))
    const card = screen.getByTestId('patient-request')
    expect(card).toHaveTextContent('Pillow')
    expect(card.querySelector('[aria-current="step"]')).toHaveTextContent('On the way')
  })

  it('stays silent when voice is off, and never reads out the history on first load', async () => {
    const { roomId } = renderRoom({ tickets: [pillow({ status: 'ACKNOWLEDGED' })] })
    await screen.findByTestId('patient-request')
    const ws = await liveSocket(roomId)
    act(() => ws.emit({ type: 'ticket.updated', ticket: pillow({ room_id: roomId, status: 'IN_PROGRESS' }), ts: '' }))
    await waitFor(() => expect(screen.getByTestId('patient-request').querySelector('[aria-current="step"]')).toHaveTextContent('On the way'))
    expect(spoken).toEqual([])
  })

  it('speaks in the screen language', async () => {
    const { roomId } = renderRoom({ tickets: [pillow()] })
    await screen.findByTestId('patient-request')
    await userEvent.click(voiceSwitch())
    await userEvent.selectOptions(screen.getByRole('combobox'), 'es')
    const ws = await liveSocket(roomId)
    act(() => ws.emit({ type: 'ticket.updated', ticket: pillow({ room_id: roomId, status: 'RESOLVED' }), ts: '' }))
    await waitFor(() => expect(spoken).toEqual(['Almohada: Listo']))
  })
})

describe('Waiting music (US-7)', () => {
  it('plays only while music is on and a request is open, then stops when it is done', async () => {
    const { roomId } = renderRoom({ tickets: [pillow()] })
    await screen.findByTestId('patient-request')
    expect(startMusic).not.toHaveBeenCalled()
    await userEvent.click(musicSwitch())
    expect(startMusic).toHaveBeenCalled()
    const ws = await liveSocket(roomId)
    vi.mocked(stopMusic).mockClear()
    act(() => ws.emit({ type: 'ticket.updated', ticket: pillow({ room_id: roomId, status: 'RESOLVED' }), ts: '' }))
    await waitFor(() => expect(stopMusic).toHaveBeenCalled())
  })

  it('does not play with no open requests, and turning it off stops it', async () => {
    renderRoom()
    await screen.findByRole('heading', { name: /hi ana/i })
    await userEvent.click(musicSwitch())
    expect(startMusic).not.toHaveBeenCalled()
    vi.mocked(stopMusic).mockClear()
    await userEvent.click(musicSwitch())
    expect(stopMusic).toHaveBeenCalled()
  })
})

describe('audio strings', () => {
  it('exist in all 7 languages', () => {
    for (const s of Object.values(AUDIO)) {
      for (const v of Object.values(s)) expect(v.length).toBeGreaterThan(0)
    }
    expect(Object.keys(AUDIO)).toHaveLength(7)
  })
})
