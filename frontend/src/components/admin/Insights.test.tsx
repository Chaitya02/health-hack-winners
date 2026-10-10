import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Analytics } from '../../lib/api'
import { mockFetch } from '../../test/fixtures'
import { HourChart, Insights } from './Insights'

function analytics(overrides: Partial<Analytics> = {}): Analytics {
  const by_hour = Array(24).fill(0)
  by_hour[9] = 4
  by_hour[14] = 7
  return {
    since: '',
    days: 1,
    total: 12,
    by_category: {},
    by_department: {},
    by_severity: { '5': 2, '4': 1, '3': 3, '2': 6, '1': 0 },
    by_hour,
    times: [{ department: 'housekeeping', requests: 6, median_ack_seconds: 45, median_resolve_seconds: 600 }],
    escalations: { total: 3, by_staff: 1, by_patient_note: 2, from_department: { housekeeping: 3 } },
    cancelled: 1,
    nudged_requests: 2,
    nudges: 5,
    notes: 1,
    fallbacks: 0,
    npo_reroutes: 1,
    fall_risk_priority: 2,
    top_rooms: [{ room_id: '412', requests: 5, nudges: 3 }],
    staff: [],
    ...overrides,
  }
}

describe('Insights', () => {
  it('shows tiles, timings and busiest rooms, and refetches when the range changes', async () => {
    const calls = mockFetch({ 'GET /api/analytics': analytics() })
    render(<Insights token="tok" />)
    expect(await screen.findByTestId('insight-escalated')).toHaveTextContent('3')
    expect(screen.getByText(/2 from patient notes · 1 by staff/)).toBeInTheDocument()
    expect(screen.getByText('10.0 min')).toBeInTheDocument()
    expect(within(screen.getByTestId('top-rooms')).getByText('412')).toBeInTheDocument()
    expect(calls[0].path).toMatch(/^\/api\/analytics\?days=1&tz_offset_minutes=-?\d+$/)

    await userEvent.click(screen.getByRole('button', { name: '7 days' }))
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true')
    expect(calls.some((c) => c.path.startsWith('/api/analytics?days=7'))).toBe(true)
  })
})

describe('HourChart', () => {
  it('labels the busiest hour, shows a tooltip on hover and has a table view', () => {
    const counts = Array(24).fill(0)
    counts[9] = 4
    counts[14] = 7
    render(<HourChart counts={counts} />)
    expect(screen.getByRole('img', { name: /busiest: 14:00 with 7/i })).toBeInTheDocument()
    const columns = screen.getAllByTestId('hour-column')
    expect(columns).toHaveLength(24)
    fireEvent.mouseEnter(columns[9])
    expect(screen.getByRole('tooltip')).toHaveTextContent('09:00–10:00: 4 requests')
    fireEvent.mouseLeave(columns[9])
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
  })
})

describe('Insights staff workload', () => {
  it('lists staff by department with status, workload and schedule', async () => {
    const shift = { start: '2026-10-10T11:00:00Z', end: '2026-10-10T23:00:00Z', kind: 'shift' as const }
    mockFetch({
      'GET /api/analytics': analytics({
        staff: [
          { staff_id: 'n-priya', name: 'Nurse Priya', department: 'nursing', status: 'available', status_until: null, open_tasks: 3, resolved: 5, median_ack_seconds: 42, schedule: [shift] },
          { staff_id: 'h-ana', name: 'Ana', department: 'housekeeping', status: 'break', status_until: null, open_tasks: 0, resolved: 2, median_ack_seconds: null, schedule: [shift] },
        ],
      }),
    })
    render(<Insights token="tok" />)
    const section = await screen.findByTestId('staff-workload')
    expect(within(section).getByText('Primary Nurse')).toBeInTheDocument()
    const priya = within(section).getByRole('row', { name: /nurse priya/i })
    expect(priya).toHaveTextContent('Available')
    expect(priya).toHaveTextContent('42 s')
    expect(within(section).getByRole('row', { name: /ana/i })).toHaveTextContent('On break')
  })
})
