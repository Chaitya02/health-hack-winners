import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { mockFetch } from '../test/fixtures'
import AdminPage from './AdminPage'

describe('AdminPage', () => {
  it('computes hours and dollars saved and reacts to assumptions', async () => {
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
})
