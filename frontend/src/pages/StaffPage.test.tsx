import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { FakeWebSocket } from '../test/setup'
import { mockFetch, ticket } from '../test/fixtures'
import StaffPage, { sortQueue } from './StaffPage'

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
    expect(within(rows[0]).getByTestId('where-who')).toHaveTextContent('4 West, Room 409Maya, 67 years')
    expect(screen.getByTestId('urgent-banner')).toHaveTextContent('Room 409')
    // Safety reasons are hidden until the nurse opens "Why you".
    const why = within(rows[0]).getByTestId('why-you')
    expect(why).not.toHaveAttribute('open')
    await userEvent.click(within(why).getByText('Why you'))
    expect(why).toHaveAttribute('open')
    expect(within(why).getByText(/red_flag:pre:wound/)).toBeVisible()
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
    expect(within(row).queryByRole('button', { name: /show original/i })).not.toBeInTheDocument()
    await userEvent.click(within(row).getByRole('button', { name: /acknowledge/i }))
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ action: 'acknowledge' })

    const ws = FakeWebSocket.instances.at(-1)!
    ws.open()
    expect(JSON.parse(ws.sent[0])).toMatchObject({ channels: ['dept:housekeeping'], token: 'tok' })
    ws.emit({ type: 'subscribed' })
    ws.emit({ type: 'ticket.escalated', ticket: ticket({ department: 'nursing', status: 'ESCALATED' }), ts: '' })
    await waitFor(() => expect(screen.queryByTestId('ticket')).not.toBeInTheDocument())
  })

  it('shows patient notes and still-waiting nudges; cancelled requests move to done', async () => {
    sessionStorage.setItem('tingting.staff.housekeeping', 'tok')
    mockFetch({
      'GET /api/queues/housekeeping': [
        ticket({
          nudge_count: 2,
          notes: [{ text: 'Two pillows if possible', at: '2026-10-10T10:00:00Z', by_role: 'patient' }],
        }),
        ticket({ ticket_id: 't_2', room_id: '406', status: 'CANCELLED', english_summary: 'Patient requests a blanket.' }),
      ],
    })
    renderStaff('housekeeping')
    const row = await screen.findByTestId('ticket')
    expect(within(row).getByTestId('still-waiting')).toHaveTextContent('Patient still waiting ×2')
    expect(within(row).getByRole('list', { name: /patient notes/i })).toHaveTextContent('Two pillows if possible')
    expect(screen.getAllByTestId('ticket')).toHaveLength(1)
    expect(screen.getByText(/done today \(1\)/i)).toBeInTheDocument()
    expect(screen.getByText(/cancelled by patient/i)).toBeInTheDocument()
  })

  it('each card shows the request icon and only its next step, plus Done', async () => {
    sessionStorage.setItem('tingting.staff.housekeeping', 'tok')
    const calls = mockFetch({
      'GET /api/queues/housekeeping': [
        ticket({ ticket_id: 'new', tile: 'pillow' }),
        ticket({ ticket_id: 'seen', status: 'ACKNOWLEDGED', room_id: '402' }),
        ticket({ ticket_id: 'going', status: 'IN_PROGRESS', room_id: '403' }),
      ],
      'PATCH /api/tickets/going': ticket({ status: 'RESOLVED' }),
    })
    renderStaff('housekeeping')
    const rows = await screen.findAllByTestId('ticket')
    const buttons = (row: HTMLElement) => within(row).getAllByRole('button').map((b) => b.textContent)
    const byId = (id: string) => rows.find((r) => r.dataset.ticketId === id)!
    expect(byId('new').querySelector('[data-icon="pillow"]')).not.toBeNull()
    expect(buttons(byId('new'))).toEqual(['Acknowledge', 'Done', 'Clinical? Send to nurse'])
    expect(buttons(byId('seen'))).toEqual(['On my way', 'Done', 'Clinical? Send to nurse'])
    expect(buttons(byId('going'))).toEqual(['Done', 'Clinical? Send to nurse'])
    await userEvent.click(within(byId('going')).getByRole('button', { name: 'Done' }))
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ action: 'resolve' })
  })

  it('shows the response deadline, and when it was missed: OVERDUE and who the backup replaced', async () => {
    sessionStorage.setItem('tingting.staff.housekeeping', 'tok')
    const inSec = (s: number) => new Date(Date.now() + s * 1000).toISOString()
    mockFetch({
      'GET /api/queues/housekeeping': [
        ticket({ ticket_id: 'fresh', ack_due_at: inSec(170) }),
        ticket({ ticket_id: 'late', room_id: '402', priority: 'HIGH', overdue: 'ack', backup_from: 'Ana', assigned_name: 'Marcus', ack_due_at: inSec(-5) }),
        ticket({ ticket_id: 'doing', room_id: '403', status: 'IN_PROGRESS', resolve_due_at: inSec(1200) }),
      ],
    })
    renderStaff('housekeeping')
    const rows = await screen.findAllByTestId('ticket')
    const byId = (id: string) => rows.find((r) => r.dataset.ticketId === id)!
    expect(within(byId('fresh')).getByTestId('deadline')).toHaveTextContent(/^Acknowledge within 2:[45]\d$/)
    expect(within(byId('fresh')).queryByTestId('overdue')).not.toBeInTheDocument()
    expect(within(byId('late')).getByTestId('overdue')).toHaveTextContent('OVERDUE')
    expect(within(byId('late')).getByTestId('deadline')).toHaveTextContent('Acknowledge overdue')
    expect(within(byId('late')).getByTestId('backup')).toHaveTextContent('Backup: Ana didn’t acknowledge in time')
    expect(within(byId('doing')).getByTestId('deadline')).toHaveTextContent(/^Resolve by \d{1,2}:\d{2} [AP]M$/)
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

  it('orders the queue by severity, then HIGH priority, then longest waiting', () => {
    const at = (min: number) => new Date(Date.UTC(2026, 9, 10, 10, min)).toISOString()
    const queue = [
      ticket({ ticket_id: 'routine-old', severity: 3, created_at: at(0) }),
      ticket({ ticket_id: 'nudged', severity: 4, created_at: at(5) }),
      ticket({ ticket_id: 'urgent', severity: 5, priority: 'HIGH', created_at: at(9) }),
      ticket({ ticket_id: 'fall-risk', severity: 4, priority: 'HIGH', created_at: at(8) }),
      ticket({ ticket_id: 'routine-new', severity: 3, created_at: at(7) }),
    ]
    expect([...queue].sort(sortQueue).map((t) => t.ticket_id)).toEqual([
      'urgent',
      'fall-risk',
      'nudged',
      'routine-old',
      'routine-new',
    ])
  })
})
