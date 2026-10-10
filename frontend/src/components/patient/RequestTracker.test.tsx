import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STRINGS } from '../../i18n/strings'
import { mockFetch } from '../../test/fixtures'
import type { PatientTicketView } from '../../types/ticket'
import { minutesLeft, nurseOnly, requestLabel, RequestTracker, stepIndex } from './RequestTracker'

const created = '2026-10-10T10:00:00.000Z'
const view = (overrides: Partial<PatientTicketView> = {}): PatientTicketView => ({
  ticket_id: 't_1',
  department: 'housekeeping',
  category: 'COMFORT_SUPPLIES',
  tile: 'pillow',
  priority: 'NORMAL',
  status: 'ACKNOWLEDGED',
  patient_confirmation: '',
  created_at: created,
  eta_minutes: 10,
  history: [
    { status: 'NEW', at: created, by_role: 'patient' },
    { status: 'ACKNOWLEDGED', at: '2026-10-10T10:02:00.000Z', by_role: 'housekeeping' },
  ],
  ...overrides,
})

function renderTracker(r = view(), lang: 'en' | 'es' = 'en') {
  return render(
    <ul>
      <RequestTracker request={r} roomId="401" lang={lang} t={STRINGS[lang]} />
    </ul>,
  )
}

afterEach(() => vi.useRealTimers())

describe('tracker helpers', () => {
  it('maps statuses to steps; escalated starts over at Sent', () => {
    expect(['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED'].map((s) => stepIndex(s as never))).toEqual([0, 1, 2, 3, 0])
  })

  it('counts minutes left down to zero', () => {
    const at = (min: number) => Date.parse(created) + min * 60_000
    expect(minutesLeft(view(), at(0))).toBe(10)
    expect(minutesLeft(view(), at(7.5))).toBe(3)
    expect(minutesLeft(view(), at(12))).toBe(0)
    expect(minutesLeft(view({ eta_minutes: null }), at(0))).toBeNull()
  })

  it('labels by tapped button, else by category, never by free text', () => {
    expect(requestLabel(view(), STRINGS.en, 'en')).toBe('Pillow')
    expect(requestLabel(view(), STRINGS.es, 'es')).toBe('Almohada')
    expect(requestLabel(view({ tile: null }), STRINGS.en, 'en')).toBe('Comfort items')
    expect(requestLabel(view({ tile: 'not-a-tile', category: 'DIETARY' }), STRINGS.en, 'en')).toBe('Food & drink')
    expect(requestLabel(view({ tile: null, category: 'EMOTIONAL_SUPPORT' }), STRINGS.pt, 'pt')).toBe('Alguém para conversar')
  })

  it('only non-clinical requests can be cancelled by the patient', () => {
    expect(nurseOnly(view())).toBe(false)
    expect(nurseOnly(view({ department: 'nursing' }))).toBe(true)
    expect(nurseOnly(view({ status: 'ESCALATED' }))).toBe(true)
  })
})

describe('RequestTracker', () => {
  it('marks the current step, shows step times and the ETA', () => {
    vi.useFakeTimers({ now: Date.parse(created) + 4 * 60_000 })
    renderTracker()
    const steps = within(screen.getByRole('list', { name: 'Request progress' })).getAllByRole('listitem')
    expect(steps.map((s) => s.getAttribute('aria-current'))).toEqual([null, 'step', null, null])
    expect(steps[1]).toHaveTextContent('Seen')
    expect(screen.getByTestId('request-label')).toHaveTextContent('Pillow')
    expect(steps[1].textContent).toMatch(/\d/) // time it was seen
    expect(screen.getByTestId('eta')).toHaveTextContent('About 6 min')
    act(() => vi.advanceTimersByTime(7 * 60_000))
    expect(screen.getByTestId('eta')).toHaveTextContent('Any minute now')
  })

  it('“Still waiting?” tells the department and confirms to the patient', async () => {
    const calls = mockFetch({ 'PATCH /api/rooms/401/tickets/t_1': view() })
    renderTracker()
    await userEvent.click(screen.getByRole('button', { name: 'Still waiting?' }))
    expect(await screen.findByText('We’ve reminded them.')).toBeInTheDocument()
    expect(calls[0]).toMatchObject({ method: 'PATCH', body: { action: 'still_waiting' } })
    expect(screen.queryByRole('button', { name: 'Still waiting?' })).not.toBeInTheDocument()
  })

  it('cancel asks for confirmation first', async () => {
    const calls = mockFetch({ 'PATCH /api/rooms/401/tickets/t_1': view({ status: 'CANCELLED' }) })
    renderTracker()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
    await userEvent.click(screen.getByRole('button', { name: 'No, keep it' }))
    expect(calls).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }))
    expect(calls[0]).toMatchObject({ method: 'PATCH', body: { action: 'cancel' } })
  })

  it('nurse requests have no cancel button and show escalation', () => {
    renderTracker(view({ department: 'nursing', status: 'ESCALATED' }))
    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument()
    expect(screen.getByText('Sent to your nurse')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Still waiting?' })).toBeInTheDocument()
  })

  it('speaks the patient’s language', () => {
    renderTracker(view(), 'es')
    expect(screen.getByRole('button', { name: '¿Sigue esperando?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar pedido' })).toBeInTheDocument()
  })
})
