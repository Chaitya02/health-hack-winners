import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockFetch, ticket } from '../test/fixtures'
import PatientPage from './PatientPage'

// Intake form → personalised dashboard (standard / audio), header bell and request panel.

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
const EMPTY = { room_id: '400', unit: '4 West', patient_alias: '', preferred_language: 'en', primary_nurse: 'N', profile: profile(), age: null, intake_complete: false, intake_at: null }
const ROSA = {
  ...EMPTY,
  patient_alias: 'Rosa',
  age: 82,
  intake_complete: true,
  intake_at: '2026-10-10T09:00:00.000Z',
  profile: profile({ dashboard: 'audio', priority_tiles: ['bathroom'], accessibility: { low_vision: true, speech_difficulty: false, cannot_write: false } }),
}
const SAM = { ...ROSA, patient_alias: 'Sam', age: 54, gender: 'male', profile: profile({ npo: true, priority_tiles: ['medication', 'counseling'] }) }

class FakeRecognition {
  static last: FakeRecognition | null = null
  lang = ''
  interimResults = false
  continuous = false
  onresult: ((e: unknown) => void) | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  start() {
    FakeRecognition.last = this
  }
  stop() {
    this.onend?.()
  }
}

beforeEach(() => {
  vi.stubGlobal('SpeechRecognition', FakeRecognition)
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn() })
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      text: string
      constructor(text: string) {
        this.text = text
      }
    },
  )
})
afterEach(() => vi.unstubAllGlobals())

function renderRoom() {
  render(
    <MemoryRouter initialEntries={['/patient/400']}>
      <Routes>
        <Route path="/patient/:roomId" element={<PatientPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Bedside intake → personalised dashboard', () => {
  it('new room shows the intake form; submitting opens the dashboard with only name and age', async () => {
    const calls = mockFetch({ 'GET /api/rooms/400/tickets': [], 'GET /api/rooms/400': EMPTY, 'PUT /api/rooms/400/intake': { room: SAM, detected: ['npo'] } })
    renderRoom()
    expect(await screen.findByRole('heading', { name: 'Welcome' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /sam, 54/i })) // demo patient fills the form
    expect(screen.getByLabelText(/^your name/i)).toHaveValue('Sam')
    // Required fields are marked (and announced); clinical notes have no placeholder.
    expect(screen.getByLabelText(/^your name/i)).toBeRequired()
    expect(screen.getByLabelText(/^your name/i).closest('label')).toHaveTextContent('(Required)')
    expect(screen.getByLabelText('Clinical notes')).not.toHaveAttribute('placeholder')
    await userEvent.click(screen.getByRole('button', { name: 'Set up my screen' }))
    const identity = await screen.findByTestId('patient-identity')
    expect(identity).toHaveTextContent(/^Sam, 54 years \(Room 400\)$/)
    expect(screen.queryByText(/NPO|knee|anxious/i)).not.toBeInTheDocument() // notes never shown
    // Emergency button says just that; no greeting; icon buttons keep accessible names.
    expect(screen.getByRole('button', { name: /^emergency$/i })).toHaveTextContent(/^Emergency$/)
    expect(screen.queryByText(/how can we help/i)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sam')
    expect(screen.getByRole('button', { name: 'Start over' }).querySelector('svg')).not.toBeNull()
    expect(screen.getByTestId('requests-bell').querySelector('svg')).not.toBeNull()
    expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ name: 'Sam', age: 54, gender: 'male', preferred_language: 'en' })
    // NPO: notes put medication + counselling first and keep food/drink out of the top 3.
    const top = within(screen.getByTestId('top-tiles')).getAllByRole('button').map((b) => b.textContent)
    expect(top).toEqual(['Medication', 'Someone to talk to', 'Pillow'])
    expect(screen.getByLabelText('Type your request')).toBeInTheDocument() // standard dashboard
    // Custom line icons; Sam's bathroom button shows the man icon.
    await userEvent.click(screen.getByRole('button', { name: 'More requests' }))
    expect(document.querySelector('[data-icon="bathroom-male"]')).not.toBeNull()
    expect(document.querySelector('[data-icon="bathroom"]')).toBeNull()
    // The bathroom tile carries the help sign.
    expect(document.querySelector('[data-help-badge] [data-icon="help"]')).not.toBeNull()
  })

  it('start over clears the patient and returns to the form', async () => {
    const calls = mockFetch({ 'GET /api/rooms/400/tickets': [], 'GET /api/rooms/400': SAM, 'DELETE /api/rooms/400/intake': EMPTY })
    renderRoom()
    await userEvent.click(await screen.findByRole('button', { name: 'Start over' }))
    expect(await screen.findByRole('heading', { name: 'Welcome' })).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true)
  })

  it('audio dashboard: voice bubble instead of the text box; speaking sends the request', async () => {
    const calls = mockFetch({
      'GET /api/rooms/400/tickets': [],
      'GET /api/rooms/400': ROSA,
      'POST /api/requests': { request_id: 'r', tickets: [ticket()], confirmation: 'Housekeeping is on the way.', confirmation_language: 'en', is_clinical: false },
    })
    renderRoom()
    const bubble = await screen.findByTestId('voice-bubble')
    expect(screen.queryByLabelText('Type your request')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^emergency$/i })).toBeEnabled()
    expect(within(screen.getByTestId('top-tiles')).getAllByRole('button')[0]).toHaveTextContent(/^Bathroom$/)
    await userEvent.click(within(bubble).getByRole('button', { name: /tap and tell me/i }))
    FakeRecognition.last!.onresult!({ results: [{ 0: { transcript: 'I need a blanket' }, isFinal: true, length: 1 }] })
    expect(await screen.findByTestId('voice-heard')).toHaveTextContent('I need a blanket')
    FakeRecognition.last!.onend!()
    await screen.findByTestId('confirmation')
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ text: 'I need a blanket', input_mode: 'voice' })
  })

  it('bell shows the open count; its panel lists open requests and drops resolved ones', async () => {
    const after = '2026-10-10T10:00:00.000Z'
    mockFetch({
      'GET /api/rooms/400/tickets': [
        ticket({ ticket_id: 'a', tile: 'pillow', status: 'ACKNOWLEDGED', created_at: after }),
        ticket({ ticket_id: 'b', tile: 'blanket', status: 'RESOLVED', created_at: after }),
        ticket({ ticket_id: 'c', tile: 'tv', status: 'CANCELLED', created_at: after }),
      ],
      'GET /api/rooms/400': SAM,
    })
    renderRoom()
    const bell = await screen.findByRole('button', { name: /your requests: 1 open request/i })
    expect(screen.queryByTestId('patient-request')).not.toBeInTheDocument()
    await userEvent.click(bell)
    const panel = await screen.findByTestId('requests-panel')
    const rows = within(panel).getAllByTestId('patient-request')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Pillow')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('requests-panel')).not.toBeInTheDocument())
  })
})
