import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { FakeWebSocket } from '../test/setup'
import { mockFetch, ticket } from '../test/fixtures'
import StaffPage from './StaffPage'

const METRICS = { diverted_from_nursing: 7 }

function renderStaff(dept: string) {
  return render(
    <MemoryRouter initialEntries={[`/staff/${dept}`]}>
      <Routes>
        <Route path="/staff/:department" element={<StaffPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('StaffPage', () => {
  it('requires the department PIN', async () => {
    const calls = mockFetch({ 'POST /api/auth/login': { token: 'tok', department: 'housekeeping' }, 'GET /api/queues/housekeeping': [] })
    renderStaff('housekeeping')
    await userEvent.type(screen.getByLabelText(/department pin/i), '2468')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByText(/no open requests/i)).toBeInTheDocument()
    expect(calls[0].body).toEqual({ department: 'housekeeping', pin: '2468' })
  })

  it('pins HIGH tickets on top for nursing, shows alert banner and diverted counter', async () => {
    sessionStorage.setItem('tingting.staff.nursing', 'tok')
    const old = new Date(Date.now() - 11 * 60_000).toISOString()
    mockFetch({
      'GET /api/queues/nursing': [
        ticket({ ticket_id: 'a', department: 'nursing', category: 'NON_URGENT_CLINICAL', created_at: old, room_id: '405' }),
        ticket({ ticket_id: 'b', department: 'nursing', priority: 'HIGH', category: 'URGENT_CLINICAL', room_id: '409', safety_reasons: ['red_flag:pre:wound'] }),
      ],
      'GET /api/metrics': METRICS,
    })
    renderStaff('nursing')
    const rows = await screen.findAllByTestId('ticket')
    expect(rows[0]).toHaveAttribute('data-priority', 'HIGH')
    expect(within(rows[0]).getByText('409')).toBeInTheDocument()
    expect(screen.getByTestId('urgent-banner')).toHaveTextContent('Room 409')
    expect(within(rows[0]).getByText(/red_flag:pre:wound/)).toBeInTheDocument()
    expect(within(rows[1]).getByLabelText(/waiting 11:/i).className).toContain('text-bell')
    await waitFor(() => expect(screen.getByTestId('diverted-counter')).toHaveTextContent('7'))
    expect(screen.queryByRole('button', { name: /send to nurse/i })).not.toBeInTheDocument()
  })

  it('removes a ticket when it is escalated away and sends PATCH actions', async () => {
    sessionStorage.setItem('tingting.staff.housekeeping', 'tok')
    const calls = mockFetch({
      'GET /api/queues/housekeeping': [ticket()],
      'PATCH /api/tickets/t_1': ticket({ status: 'ACKNOWLEDGED' }),
    })
    renderStaff('housekeeping')
    const row = await screen.findByTestId('ticket')
    await userEvent.click(within(row).getByRole('button', { name: /show original/i }))
    expect(within(row).getByText(/extra pillow please/)).toBeInTheDocument()
    await userEvent.click(within(row).getByRole('button', { name: /acknowledge/i }))
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ action: 'acknowledge' })

    const ws = FakeWebSocket.instances.at(-1)!
    ws.open()
    expect(JSON.parse(ws.sent[0])).toMatchObject({ channels: ['dept:housekeeping'], token: 'tok' })
    ws.emit({ type: 'subscribed' })
    ws.emit({ type: 'ticket.escalated', ticket: ticket({ department: 'nursing', status: 'ESCALATED' }), ts: '' })
    await waitFor(() => expect(screen.queryByTestId('ticket')).not.toBeInTheDocument())
  })

  it('shows reconnecting status when the socket drops', async () => {
    sessionStorage.setItem('tingting.staff.food', 'tok')
    mockFetch({ 'GET /api/queues/food': [] })
    renderStaff('food')
    await screen.findByText(/no open requests/i)
    const ws = FakeWebSocket.instances.at(-1)!
    ws.open()
    ws.emit({ type: 'subscribed' })
    await waitFor(() => expect(screen.getByTestId('live-status')).toHaveAttribute('data-status', 'live'))
    ws.close()
    await waitFor(() => expect(screen.getByTestId('live-status')).toHaveAttribute('data-status', 'offline'))
  })
})
