import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { procedureStage } from '../lib/procedures'
import { FakeWebSocket } from '../test/setup'
import { mockFetch } from '../test/fixtures'
import PatientPage from './PatientPage'

// Procedures: shown on the dashboard and announced when set up, 15 min before, and at the time.

vi.mock('../lib/waitingMusic', () => ({ prime: vi.fn(), start: vi.fn(), stop: vi.fn(), duck: vi.fn() }))

const inMin = (m: number) => new Date(Date.now() + m * 60_000).toISOString()
const room = (procedures: { name: string; at: string }[], over: Record<string, unknown> = {}) => ({
  room_id: '400',
  unit: '4 West',
  patient_alias: 'Rosa',
  preferred_language: 'en',
  primary_nurse: 'N',
  age: 82,
  gender: 'female',
  intake_complete: true,
  intake_at: '2026-10-10T10:00:00Z',
  profile: { npo: false, fall_risk: false, attendant_preference: 'any', accessibility: {}, dashboard: 'standard', priority_tiles: [], notes_flags: [] },
  procedures,
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
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.stubGlobal('WebSocket', FakeWebSocket)
})

function renderRoom() {
  return render(
    <MemoryRouter initialEntries={['/patient/400']}>
      <Routes>
        <Route path="/patient/:roomId" element={<PatientPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('procedure stages', () => {
  const now = Date.parse('2026-10-10T15:00:00Z')
  const at = (m: number) => ({ name: 'X-ray', at: new Date(now + m * 60_000).toISOString() })
  it('scheduled → soon (15 min) → now (until 30 min after) → past', () => {
    expect(procedureStage(at(16), now).stage).toBe('scheduled')
    expect(procedureStage(at(15), now)).toEqual({ stage: 'soon', minutes: 15 })
    expect(procedureStage(at(0), now).stage).toBe('now')
    expect(procedureStage(at(-29), now).stage).toBe('now')
    expect(procedureStage(at(-30), now).stage).toBe('past')
  })
})

describe('procedures on the bedside screen', () => {
  it('lists them with times and announces them once, out loud and on screen', async () => {
    mockFetch({ 'GET /api/rooms/400/tickets': [], 'GET /api/rooms/400': room([{ name: 'Blood test', at: inMin(10) }, { name: 'Physiotherapy', at: inMin(180) }]) })
    const { unmount } = renderRoom()
    const list = await screen.findByTestId('procedures')
    const items = within(list).getAllByRole('listitem')
    expect(items.map((li) => li.dataset.stage)).toEqual(['soon', 'scheduled'])
    expect(items[0]).toHaveTextContent(/Blood test.*in 10 min/)
    const notice = await screen.findByTestId('procedure-notice')
    expect(notice).toHaveTextContent(/^Reminder: Blood test at .+, in 10 minutes\. You have Physiotherapy at .+\.$/)
    await waitFor(() => expect(spoken).toEqual([notice.textContent]))

    // Reload: already told, so nothing is repeated.
    unmount()
    renderRoom()
    await screen.findByTestId('procedures')
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByTestId('procedure-notice')).not.toBeInTheDocument()
    expect(spoken).toHaveLength(1)
  })

  it('says when it is time, shows it on screen only when spoken updates are off', async () => {
    localStorage.setItem('tingting.audio.400', JSON.stringify({ voice: false, music: true }))
    mockFetch({ 'GET /api/rooms/400/tickets': [], 'GET /api/rooms/400': room([{ name: 'Chest X-ray', at: inMin(-1) }]) })
    renderRoom()
    expect(await screen.findByTestId('procedure-notice')).toHaveTextContent('It’s time for your Chest X-ray. Your nurse will come for you.')
    expect(within(screen.getByTestId('procedures')).getByRole('listitem')).toHaveTextContent(/Now$/)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('procedure-notice')).not.toBeInTheDocument()
    expect(spoken).toEqual([])
  })

  it('the demo patient brings their procedures, timed from when the form is sent', async () => {
    const calls = mockFetch({
      'GET /api/rooms/400/tickets': [],
      'GET /api/rooms/400': room([], { intake_complete: false, patient_alias: '' }),
      'PUT /api/rooms/400/intake': { room: room([]), detected: [] },
    })
    renderRoom()
    await userEvent.click(await screen.findByRole('button', { name: /Rosa, 82/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Set up my screen' }))
    await screen.findByTestId('patient-identity')
    const sent = calls.find((c) => c.method === 'PUT')?.body as { procedures: { name: string; at: string }[] }
    expect(sent.procedures.map((p) => p.name)).toEqual(['Blood test', 'Physiotherapy'])
    expect(Math.round((Date.parse(sent.procedures[0].at) - Date.now()) / 60_000)).toBe(10)
  })
})
