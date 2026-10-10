import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { FakeWebSocket } from '../test/setup'
import { mockFetch, ticket } from '../test/fixtures'
import PatientPage from './PatientPage'

const ROOM = { room_id: '401', unit: '4 West Med-Surg', patient_alias: 'Maya', preferred_language: 'en', primary_nurse: 'N' }

function renderPatient() {
  return render(
    <MemoryRouter initialEntries={['/patient/401']}>
      <Routes>
        <Route path="/patient/:roomId" element={<PatientPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PatientPage', () => {
  it('shows greeting, all quick-tap tiles and the nurse button', async () => {
    mockFetch({ 'GET /api/rooms/401/tickets': [], 'GET /api/rooms/401': ROOM })
    renderPatient()
    expect(await screen.findByRole('heading', { name: /hi maya/i })).toBeInTheDocument()
    for (const label of ['Water', 'Ice', 'Pillow', 'Blanket', 'Help to the bathroom', 'Room temperature', 'TV / remote', 'Food / menu']) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: /i need my nurse/i })).toBeInTheDocument()
  })

  it('tapping Pillow sends a quick-tap request and shows the confirmation', async () => {
    const pillow = ticket()
    const calls = mockFetch({
      'GET /api/rooms/401/tickets': [],
      'GET /api/rooms/401': ROOM,
      'POST /api/requests': {
        request_id: 'r_1',
        tickets: [pillow],
        confirmation: 'Housekeeping is on the way.',
        confirmation_language: 'en',
        is_clinical: false,
      },
    })
    renderPatient()
    await userEvent.click(await screen.findByRole('button', { name: /pillow/i }))
    expect(await screen.findByTestId('confirmation')).toHaveTextContent('Housekeeping is on the way.')
    const post = calls.find((c) => c.method === 'POST')
    expect(post?.body).toMatchObject({ room_id: '401', input_mode: 'quick_tap', tile: 'pillow', language_hint: 'en' })
  })

  it('switches the UI to the detected language after a free-text request', async () => {
    mockFetch({
      'GET /api/rooms/401/tickets': [],
      'GET /api/rooms/401': ROOM,
      'POST /api/requests': {
        request_id: 'r_2',
        tickets: [ticket({ department: 'food', detected_language: 'es' })],
        confirmation: 'Servicios de alimentación va en camino.',
        confirmation_language: 'es',
        is_clinical: false,
      },
    })
    renderPatient()
    await userEvent.type(await screen.findByLabelText(/type your request/i), '¿Me puede traer agua con hielo?')
    await userEvent.click(screen.getByRole('button', { name: /send request/i }))
    expect(await screen.findByTestId('confirmation')).toHaveTextContent('Servicios de alimentación')
    expect(screen.getByRole('button', { name: /hacer otro pedido/i })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('es')
  })

  it('shows a red nurse confirmation for clinical requests', async () => {
    mockFetch({
      'GET /api/rooms/401/tickets': [],
      'GET /api/rooms/401': ROOM,
      'POST /api/requests': {
        request_id: 'r_3',
        tickets: [ticket({ department: 'nursing', priority: 'HIGH', category: 'URGENT_CLINICAL' })],
        confirmation: 'Your nurse has been alerted and is coming now.',
        confirmation_language: 'en',
        is_clinical: true,
      },
    })
    renderPatient()
    await userEvent.click(await screen.findByRole('button', { name: /i need my nurse/i }))
    const box = await screen.findByTestId('confirmation')
    expect(box).toHaveTextContent('Your nurse has been alerted')
    expect(box.className).toContain('bg-bell')
  })

  it('updates request status live from the room channel', async () => {
    mockFetch({ 'GET /api/rooms/401/tickets': [], 'GET /api/rooms/401': ROOM })
    renderPatient()
    await screen.findByRole('heading', { name: /hi maya/i })
    await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0))
    const ws = FakeWebSocket.instances.at(-1)!
    ws.open()
    expect(JSON.parse(ws.sent[0])).toMatchObject({ action: 'subscribe', channels: ['room:401'] })
    ws.emit({ type: 'subscribed', channels: ['room:401'] })
    ws.emit({ type: 'ticket.updated', ticket: ticket({ status: 'IN_PROGRESS' }), ts: '' })
    const row = await screen.findByTestId('patient-request')
    expect(row).toHaveAttribute('data-status', 'IN_PROGRESS')
    // The tracker lists every step; the current one is marked.
    expect(row.querySelector('[aria-current="step"]')).toHaveTextContent('On the way')
  })

  it('shows the screensaver after 3 idle minutes and comes back with the draft intact', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      mockFetch({ 'GET /api/rooms/401/tickets': [], 'GET /api/rooms/401': ROOM })
      renderPatient()
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      await screen.findByRole('heading', { name: /hi maya/i })
      await user.type(screen.getByLabelText(/type your request/i), 'extra pillow')

      act(() => vi.advanceTimersByTime(179_000))
      expect(screen.queryByTestId('screensaver')).not.toBeInTheDocument()
      act(() => vi.advanceTimersByTime(1_000))
      expect(screen.getByTestId('screensaver')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Tap anywhere to continue' }))
      expect(screen.queryByTestId('screensaver')).not.toBeInTheDocument()
      expect(screen.getByLabelText(/type your request/i)).toHaveValue('extra pillow')
    } finally {
      vi.useRealTimers()
    }
  })
})
