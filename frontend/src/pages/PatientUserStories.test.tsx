import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Confirmation } from '../components/patient/Confirmation'
import { profileRefusalMessage } from '../components/patient/profileRules'
import { STRINGS } from '../i18n/strings'
import * as waitingMusic from '../lib/waitingMusic'
import { FakeWebSocket } from '../test/setup'
import { mockFetch, ticket } from '../test/fixtures'
import PatientPage from './PatientPage'

// US-5 (NPO gray-out, fall-risk badge), US-6 (attendant preference), US-7 (spoken updates,
// waiting music, toggles) on the bedside dashboard.

vi.mock('../lib/waitingMusic', () => ({ prime: vi.fn(), start: vi.fn(), stop: vi.fn(), duck: vi.fn() }))

const profile = (over: Record<string, unknown> = {}) => ({
  npo: false,
  npo_reason: null,
  fall_risk: false,
  diet: null,
  attendant_preference: 'any',
  accessibility: { low_vision: false, speech_difficulty: false, cannot_write: false },
  dashboard: 'standard',
  priority_tiles: [],
  notes_flags: [],
  ...over,
})
const room = (over: Record<string, unknown> = {}) => ({
  room_id: '400',
  unit: '4 West',
  patient_alias: 'Sam',
  preferred_language: 'en',
  primary_nurse: 'N',
  age: 54,
  gender: 'male',
  intake_complete: true,
  intake_at: null,
  profile: profile(),
  ...over,
})

const spoken: string[] = []
beforeEach(() => {
  spoken.length = 0
  localStorage.clear()
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: (u: { text: string }) => spoken.push(u.text) })
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      text: string
      constructor(text: string) {
        this.text = text
      }
    },
  )
  vi.mocked(waitingMusic.start).mockClear()
  vi.mocked(waitingMusic.stop).mockClear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.stubGlobal('WebSocket', FakeWebSocket) // test/setup installs it once per file
})

function renderRoom() {
  render(
    <MemoryRouter initialEntries={['/patient/400']}>
      <Routes>
        <Route path="/patient/:roomId" element={<PatientPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('US-5: NPO gray-out and fall-risk badge', () => {
  it('food and drink are grayed out and explain why instead of sending', async () => {
    const calls = mockFetch({
      'GET /api/rooms/400/tickets': [],
      'GET /api/rooms/400': room({ profile: profile({ npo: true }) }),
      'POST /api/requests': { request_id: 'r', tickets: [ticket()], confirmation: 'ok', confirmation_language: 'en', is_clinical: false },
    })
    renderRoom()
    await userEvent.click(await screen.findByRole('button', { name: 'More requests' }))
    const thirsty = screen.getByRole('button', { name: 'Thirsty' })
    expect(thirsty).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(thirsty)
    expect(screen.getByTestId('blocked-notice')).toHaveTextContent(STRINGS.en.npoBlocked)
    // Food & medication stays open; Food is blocked, Medication still sends.
    await userEvent.click(screen.getByRole('button', { name: 'Food & medication' }))
    expect(screen.getByRole('button', { name: 'Food / menu' })).toHaveAttribute('aria-disabled', 'true')
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Medication' }))
    await screen.findByTestId('confirmation')
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ tile: 'medication' })
  })

  it('a server profile refusal shows its own patient-language message', () => {
    expect(profileRefusalMessage(409, JSON.stringify({ code: 'npo', message: 'No puede comer.' }))).toBe('No puede comer.')
    expect(profileRefusalMessage(409, 'plain text')).toBeNull()
    expect(profileRefusalMessage(500, '{}')).toBeNull()
  })

  it('a fall-risk request shows "Marked higher priority" on the confirmation', () => {
    const result = {
      request_id: 'r',
      tickets: [ticket({ department: 'nursing', priority: 'HIGH', safety_reasons: ['fall_risk'] })],
      confirmation: 'Your nurse has been notified.',
      confirmation_language: 'en' as const,
      is_clinical: false,
    }
    render(<Confirmation result={result} t={STRINGS.en} onDone={() => {}} />)
    expect(screen.getByTestId('priority-badge')).toHaveTextContent('Marked higher priority')
  })
})

describe('US-6: attendant preference', () => {
  it('the intake form sends the bathroom attendant choice', async () => {
    const calls = mockFetch({
      'GET /api/rooms/400/tickets': [],
      'GET /api/rooms/400': room({ intake_complete: false, patient_alias: '' }),
      'PUT /api/rooms/400/intake': { room: room({ patient_alias: 'Rosa' }), detected: [] },
    })
    renderRoom()
    await userEvent.click(await screen.findByRole('button', { name: /Rosa, 82/ })) // demo: prefers female
    expect(screen.getByRole('radio', { name: 'Female staff' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Male staff' }))
    await userEvent.click(screen.getByRole('button', { name: 'Set up my screen' }))
    await screen.findByTestId('patient-identity')
    expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ attendant_preference: 'male' })
  })
})

describe('US-7: spoken updates and waiting music', () => {
  async function liveRoom(requests = [ticket({ ticket_id: 'a', tile: 'pillow', status: 'NEW', room_id: '400' })]) {
    mockFetch({ 'GET /api/rooms/400/tickets': requests, 'GET /api/rooms/400': room() })
    renderRoom()
    await screen.findByTestId('patient-identity')
    await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0))
    const ws = FakeWebSocket.instances.at(-1)!
    ws.open()
    ws.emit({ type: 'subscribed', channels: ['room:400'] })
    return ws
  }

  it('status changes are read aloud in the same words as the screen; never on first load', async () => {
    const ws = await liveRoom()
    expect(spoken).toEqual([])
    act(() => ws.emit({ type: 'ticket.updated', ticket: ticket({ ticket_id: 'a', tile: 'pillow', status: 'ACKNOWLEDGED', room_id: '400' }), ts: '' }))
    await waitFor(() => expect(spoken).toEqual(['Pillow: Seen']))
  })

  it('music plays while a request is open; both can be switched off and stay off', async () => {
    const ws = await liveRoom()
    await waitFor(() => expect(waitingMusic.start).toHaveBeenCalled())
    const music = screen.getByTestId('toggle-music')
    expect(music).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(music)
    expect(music).toHaveAttribute('aria-pressed', 'false')
    expect(waitingMusic.stop).toHaveBeenCalled()
    await userEvent.click(screen.getByTestId('toggle-voice'))
    act(() => ws.emit({ type: 'ticket.updated', ticket: ticket({ ticket_id: 'a', tile: 'pillow', status: 'IN_PROGRESS', room_id: '400' }), ts: '' }))
    await act(async () => {}) // let the update render
    expect(spoken).toEqual([]) // voice off
    expect(JSON.parse(localStorage.getItem('tingting.audio.400')!)).toEqual({ voice: false, music: false })
  })
})

describe('input that is not a request', () => {
  it('is turned back with the server’s message; nothing is confirmed', async () => {
    const calls = mockFetch({ 'GET /api/rooms/400/tickets': [], 'GET /api/rooms/400': room() })
    const ok = vi.mocked(fetch).getMockImplementation()!
    const message = 'Sorry, I didn’t understand a request. Please try again, or tap a button.'
    vi.mocked(fetch).mockImplementation(async (input, init) =>
      init?.method === 'POST'
        ? new Response(JSON.stringify({ detail: { code: 'not_a_request', reason: 'gibberish', message } }), { status: 422 })
        : ok(input, init),
    )
    renderRoom()
    await userEvent.type(await screen.findByLabelText(STRINGS.en.typeLabel), 'asdfgh')
    await userEvent.click(screen.getByRole('button', { name: STRINGS.en.send }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByTestId('confirmation')).not.toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(0)
  })

  it('a 422 with a code carries the message; a plain validation error does not', () => {
    expect(profileRefusalMessage(422, JSON.stringify({ code: 'not_a_request', message: 'Inténtelo de nuevo.' }))).toBe('Inténtelo de nuevo.')
    expect(profileRefusalMessage(422, JSON.stringify([{ loc: ['body', 'text'] }]))).toBeNull()
  })
})
