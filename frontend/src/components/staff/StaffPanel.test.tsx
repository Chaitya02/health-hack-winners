import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { mockFetch, ticket } from '../../test/fixtures'
import StaffPage from '../../pages/StaffPage'
import type { StaffView } from '../../types/ticket'
import { StaffPanel } from './StaffPanel'

const NOW = Date.parse('2026-10-10T14:00:00Z')
const iso = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString()
const shift = { start: iso(-180), end: iso(540), kind: 'shift' as const }

const STAFF: StaffView[] = [
  {
    staff_id: 'n-jordan',
    name: 'Nurse Jordan',
    department: 'nursing',
    gender: 'male',
    schedule: [shift, { start: iso(-10), end: iso(20), kind: 'break' }],
    status: 'break',
    status_until: iso(20),
    open_tasks: 0,
  },
  { staff_id: 'n-priya', name: 'Nurse Priya', department: 'nursing', gender: 'female', schedule: [shift], status: 'available', status_until: iso(120), open_tasks: 2 },
]

describe('StaffPanel', () => {
  it('shows each person’s status, open tasks and schedule with a now marker', () => {
    render(<StaffPanel staff={STAFF} now={NOW} waiting={1} />)
    const [jordan, priya] = screen.getAllByTestId('staff-member')
    expect(within(jordan).getByTestId('staff-status')).toHaveTextContent('On break')
    expect(within(priya).getByTestId('staff-status')).toHaveTextContent('Available')
    expect(within(priya).getByTestId('staff-load')).toHaveTextContent(/^2 open · until /)
    expect(within(jordan).getByRole('img').getAttribute('aria-label')).toMatch(/^Shift .*; breaks .*–/)
    expect(screen.getAllByTestId('now-marker')).toHaveLength(2)
    expect(screen.getByTestId('waiting-count')).toHaveTextContent('1 waiting for someone available')
  })
})

describe('Department dashboard with staff', () => {
  it('labels who has each request and filters by person or waiting', async () => {
    sessionStorage.setItem('tingting.staff.nursing', 'tok')
    mockFetch({
      'GET /api/queues/nursing': [
        ticket({ ticket_id: 'a', department: 'nursing', room_id: '401', assigned_to: 'n-priya', assigned_name: 'Nurse Priya' }),
        ticket({ ticket_id: 'b', department: 'nursing', room_id: '402', attendant_preference: 'female', attendant_preference_met: false }),
      ],
      'GET /api/staff/nursing': STAFF,
      'GET /api/metrics': { diverted_from_nursing: 0 },
    })
    render(
      <MemoryRouter initialEntries={['/nursing']}>
        <Routes>
          <Route path="/:department" element={<StaffPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByTestId('staff-panel')).toBeInTheDocument()
    expect(screen.getAllByTestId('assignee').map((n) => n.textContent)).toEqual(['Assigned to Nurse Priya', 'Waiting for someone available'])
    expect(screen.getByTestId('attendant-pref')).toHaveTextContent('Prefers female staff · none available, assigned to the next available')
    await userEvent.click(screen.getByRole('button', { name: 'Nurse Priya (1)' }))
    expect(screen.getAllByTestId('ticket')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Waiting (1)' }))
    expect(within(screen.getByTestId('ticket')).getByText('402')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Nurse Jordan (0)' }))
    expect(screen.getByText('Nothing here right now.')).toBeInTheDocument()
  })
})
