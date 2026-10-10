import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockFetch } from '../test/fixtures'
import AdminPage from './AdminPage'
import StaffPage from './StaffPage'

// Demo mode: department and admin links open straight onto the page (no PIN screen).

beforeEach(() => vi.stubEnv('VITE_AUTO_SIGN_IN', 'true'))
afterEach(() => vi.unstubAllEnvs())

describe('auto sign-in (demo)', () => {
  it('department link opens the dashboard without the PIN screen', async () => {
    const calls = mockFetch({
      'POST /api/auth/login': { token: 'tok', role: 'housekeeping', department: 'housekeeping' },
      'GET /api/queues/housekeeping': [],
    })
    render(
      <MemoryRouter initialEntries={['/housekeeping']}>
        <Routes>
          <Route path="/:department" element={<StaffPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/no open requests/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/department pin/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
    expect(calls[0].body).toEqual({ department: 'housekeeping', pin: '2468' })
  })

  it('falls back to the PIN form if the demo sign-in is refused', async () => {
    mockFetch({ 'GET /api/queues/food': [] }) // login → 404
    render(
      <MemoryRouter initialEntries={['/food']}>
        <Routes>
          <Route path="/:department" element={<StaffPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByLabelText(/department pin/i)).toBeInTheDocument()
  })

  it('admin link opens the impact page without the PIN screen', async () => {
    const calls = mockFetch({
      'POST /api/auth/login': { token: 'admin-tok', role: 'admin', department: null },
      'GET /api/metrics': { total: 0, by_category: {}, by_department: {}, avg_ack_seconds: {}, avg_resolve_seconds: {}, open_by_department: {} },
    })
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/requests today/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/admin pin/i)).not.toBeInTheDocument()
    expect(calls[0].body).toEqual({ role: 'admin', pin: '1357' })
  })
})
