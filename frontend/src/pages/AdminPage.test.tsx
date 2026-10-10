import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { mockFetch } from '../test/fixtures'
import AdminPage from './AdminPage'

describe('AdminPage', () => {
  it('computes hours and dollars saved and reacts to assumptions', async () => {
    sessionStorage.setItem('tingting.admin', 'admin-tok')
    mockFetch({
      'GET /api/metrics': {
        since: '',
        total: 10,
        by_category: { DIETARY: 4, URGENT_CLINICAL: 1 },
        by_department: {},
        diverted_from_nursing: 7,
        diverted_pct: 70,
        avg_ack_seconds: { nursing: 30 },
        avg_resolve_seconds: {},
        urgent_count: 1,
        urgent_avg_ack_seconds: 25,
        fallback_count: 0,
        open_by_department: {},
      },
    })
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('70%')).toBeInTheDocument()
    expect(screen.getByTestId('impact-unit-hours')).toHaveTextContent('4,380 h')
    expect(screen.getByTestId('impact-hospital-hours')).toHaveTextContent('73,000 h')
    fireEvent.change(screen.getByTestId('impact-beds'), { target: { value: '60' } })
    expect(screen.getByTestId('impact-unit-hours')).toHaveTextContent('8,760 h')
  })

  it('requires the admin PIN before showing anything', async () => {
    const calls = mockFetch({
      'POST /api/auth/login': (_url: string, init?: RequestInit) =>
        JSON.parse(String(init?.body)).pin === '1357' ? { token: 'admin-tok', role: 'admin', department: null } : undefined,
      'GET /api/metrics': { total: 0, by_category: {}, by_department: {}, avg_ack_seconds: {}, avg_resolve_seconds: {}, open_by_department: {} },
    })
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    )
    expect(screen.queryByText(/requests today/i)).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/admin pin/i), '1357')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByText(/requests today/i)).toBeInTheDocument()
    expect(calls[0].body).toEqual({ role: 'admin', pin: '1357' })
    expect(sessionStorage.getItem('tingting.admin')).toBe('admin-tok')
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(screen.getByLabelText(/admin pin/i)).toBeInTheDocument()
  })
})
