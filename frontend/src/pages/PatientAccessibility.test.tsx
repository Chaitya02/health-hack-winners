import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockFetch, ticket } from '../test/fixtures'
import PatientPage from './PatientPage'

// US-4 layouts on the real patient page. Kept apart from PatientPage.test.tsx (patient-UI track).

type Flags = { low_vision?: boolean; speech_difficulty?: boolean; cannot_write?: boolean }
const room = (flags: Flags) => ({
  room_id: '414',
  unit: '4 West Med-Surg',
  patient_alias: 'Alex',
  preferred_language: 'en',
  primary_nurse: 'N',
  profile: {
    npo: false,
    npo_reason: null,
    fall_risk: false,
    diet: null,
    attendant_preference: 'any',
    accessibility: { low_vision: false, speech_difficulty: false, cannot_write: false, ...flags },
  },
})

class FakeRecognition {
  static last: FakeRecognition | null = null
  lang = ''
  interimResults = false
  continuous = false
  onresult: ((e: { results: { 0: { transcript: string }; isFinal: boolean; length: number }[] }) => void) | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  start() {
    FakeRecognition.last = this
  }
  stop() {}
}

const spoken: string[] = []

beforeEach(() => {
  spoken.length = 0
  vi.stubGlobal('SpeechRecognition', FakeRecognition)
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
afterEach(() => vi.unstubAllGlobals())

function renderRoom(flags: Flags) {
  const calls = mockFetch({
    'GET /api/rooms/414/tickets': [],
    'GET /api/rooms/414': room(flags),
    'POST /api/requests': {
      request_id: 'r_1',
      tickets: [ticket({ room_id: '414' })],
      confirmation: 'Housekeeping is on the way.',
      confirmation_language: 'en',
      is_clinical: false,
    },
  })
  render(
    <MemoryRouter initialEntries={['/patient/414']}>
      <Routes>
        <Route path="/patient/:roomId" element={<PatientPage />} />
      </Routes>
    </MemoryRouter>,
  )
  return calls
}

const mic = () => screen.queryByRole('button', { name: /tap to speak/i })
const textBox = () => screen.queryByLabelText(/type your request/i)

describe('Patient accessibility layouts (US-4)', () => {
  it('default: text box, mic, normal tiles, nothing read aloud', async () => {
    renderRoom({})
    await screen.findByRole('heading', { name: 'Alex' })
    expect(textBox()).toBeInTheDocument()
    expect(mic()).toBeInTheDocument()
    // Pillow is one of the default top 3 buttons.
    expect(screen.getByRole('button', { name: 'Pillow' }).className).toContain('min-h-36')
    await userEvent.click(screen.getByRole('button', { name: 'Pillow' }))
    await screen.findByTestId('confirmation')
    expect(spoken).toEqual([])
  })

  it('low vision: no text box, mic kept, large tiles, reads the pressed button and result aloud', async () => {
    renderRoom({ low_vision: true })
    await screen.findByRole('heading', { name: 'Alex' })
    await waitFor(() => expect(textBox()).not.toBeInTheDocument())
    expect(mic()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pillow' }).className).toContain('min-h-44')
    expect(screen.getByRole('button', { name: /^emergency$/i })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Pillow' }))
    await screen.findByTestId('confirmation')
    expect(spoken).toEqual(['Pillow. Housekeeping is on the way.'])
  })

  it('low vision: what the mic heard is shown and can be sent without a text box', async () => {
    const calls = renderRoom({ low_vision: true })
    await waitFor(() => expect(textBox()).not.toBeInTheDocument())
    await userEvent.click(mic()!)
    FakeRecognition.last!.onresult!({ results: [{ 0: { transcript: 'extra pillow' }, isFinal: true, length: 1 }] })
    expect(await screen.findByTestId('voice-transcript')).toHaveTextContent('extra pillow')
    await userEvent.click(screen.getByRole('button', { name: /send request/i }))
    await screen.findByTestId('confirmation')
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ text: 'extra pillow', input_mode: 'voice' })
  })

  it('speech difficulty: no mic; text box and tiles stay', async () => {
    renderRoom({ speech_difficulty: true })
    await screen.findByRole('heading', { name: 'Alex' })
    await waitFor(() => expect(mic()).not.toBeInTheDocument())
    expect(textBox()).toBeInTheDocument()
    expect(screen.queryByText(/voice input isn’t available/i)).not.toBeInTheDocument()
  })

  it('cannot write: no text box; mic and tiles stay', async () => {
    renderRoom({ cannot_write: true })
    await screen.findByRole('heading', { name: 'Alex' })
    await waitFor(() => expect(textBox()).not.toBeInTheDocument())
    expect(mic()).toBeInTheDocument()
  })

  it('speech difficulty + cannot write: buttons only, nurse button still there', async () => {
    renderRoom({ speech_difficulty: true, cannot_write: true })
    await screen.findByRole('heading', { name: 'Alex' })
    await waitFor(() => expect(textBox()).not.toBeInTheDocument())
    expect(mic()).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pillow' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^emergency$/i })).toBeEnabled()
  })
})
