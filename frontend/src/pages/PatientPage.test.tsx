import { act, render, screen, waitFor, within } from '@testing-library/react'
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

/** Everything beyond the patient's top 3 sits behind "More requests". */
const openMore = async () => userEvent.click(await screen.findByRole('button', { name: 'More requests' }))

describe('PatientPage', () => {
  it('shows greeting, the top 3 buttons, the nurse button, and the rest under More requests', async () => {
    mockFetch({ 'GET /api/rooms/401/tickets': [], 'GET /api/rooms/401': ROOM })
    renderPatient()
    expect(await screen.findByRole('heading', { name: 'Maya' })).toBeInTheDocument()
    const top = within(screen.getByTestId('top-tiles')).getAllByRole('button')
    expect(top.map((b) => b.textContent)).toEqual(['Water', 'Pillow', 'Bathroom'])
    expect(screen.queryByRole('button', { name: 'Comfort' })).not.toBeInTheDocument()
    await openMore()
    // The top 3 aren't repeated in the dropdown (Bathroom is a top tile, so its main tile goes).
    expect(screen.getAllByRole('button', { name: 'Bathroom' })).toHaveLength(1)
    for (const label of ['Thirsty', 'Comfort', 'Food & medication', 'Emotional support']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: /^emergency$/i })).toBeInTheDocument()
  })

  it.each([
    // Water and Pillow are default top tiles, so their groups only list the rest.
    ['Thirsty', ['Ice']],
    ['Comfort', ['Blanket', 'Room temperature', 'TV / remote']],
    ['Food & medication', ['Food / menu', 'Medication']],
    ['Emotional support', ['Contact my family', 'Someone to talk to', 'Spiritual care']],
  ])('%s opens its choices, keeps the nurse button, and Back returns', async (group, items) => {
    mockFetch({ 'GET /api/rooms/401/tickets': [], 'GET /api/rooms/401': ROOM })
    renderPatient()
    await openMore()
    await userEvent.click(await screen.findByRole('button', { name: group }))
    expect(screen.getByRole('heading', { name: group })).toHaveFocus()
    for (const label of items) expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^emergency$/i })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByRole('button', { name: 'Comfort' })).toBeInTheDocument()
  })

  it('medication under Food & medication sends the medication tile (routed to nursing)', async () => {
    const calls = mockFetch({
      'GET /api/rooms/401/tickets': [],
      'GET /api/rooms/401': ROOM,
      'POST /api/requests': {
        request_id: 'r_m',
        tickets: [ticket({ department: 'nursing', category: 'NON_URGENT_CLINICAL' })],
        confirmation: 'Your nurse has your request.',
        confirmation_language: 'en',
        is_clinical: false,
      },
    })
    renderPatient()
    await openMore()
    await userEvent.click(await screen.findByRole('button', { name: 'Food & medication' }))
    await userEvent.click(screen.getByRole('button', { name: 'Medication' }))
    await screen.findByTestId('confirmation')
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ input_mode: 'quick_tap', tile: 'medication' })
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
    // Pillow is one of the default top 3.
    await userEvent.click(await screen.findByRole('button', { name: 'Pillow' }))
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

  it('Emergency needs a second tap, then shows a red nurse confirmation', async () => {
    const calls = mockFetch({
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
    await userEvent.click(await screen.findByRole('button', { name: /^emergency$/i }))
    // First tap: a toast asks to tap again; nothing is sent yet. Second tap on the same button sends.
    expect(screen.getByTestId('emergency-toast')).toHaveTextContent('Tap Emergency again')
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: /^emergency$/i }))
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ tile: 'nurse', input_mode: 'quick_tap' })
    const box = await screen.findByTestId('confirmation')
    expect(box).toHaveTextContent('Your nurse has been alerted')
    expect(box.className).toContain('bg-bell')
  })

  it('updates request status live from the room channel', async () => {
    mockFetch({ 'GET /api/rooms/401/tickets': [], 'GET /api/rooms/401': ROOM })
    renderPatient()
    await screen.findByRole('heading', { name: 'Maya' })
    await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0))
    const ws = FakeWebSocket.instances.at(-1)!
    ws.open()
    expect(JSON.parse(ws.sent[0])).toMatchObject({ action: 'subscribe', channels: ['room:401'] })
    ws.emit({ type: 'subscribed', channels: ['room:401'] })
    ws.emit({ type: 'ticket.updated', ticket: ticket({ status: 'IN_PROGRESS' }), ts: '' })
    // Requests live behind the header bell; its badge counts open ones.
    await userEvent.click(await screen.findByRole('button', { name: /your requests: 1 open request/i }))
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
      await screen.findByRole('heading', { name: 'Maya' })
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
