import { render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from './App'
import { mockFetch } from './test/fixtures'

const ROOM = { room_id: '401', unit: '4 West Med-Surg', patient_alias: 'Maya', preferred_language: 'en', primary_nurse: 'N' }

function Where() {
  return <output data-testid="path">{useLocation().pathname}</output>
}

function renderAt(path: string) {
  mockFetch({ 'GET /api/rooms/401/tickets': [], 'GET /api/rooms/401': ROOM, 'GET /api/metrics': {} })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Where />
    </MemoryRouter>,
  )
}

describe('App routes', () => {
  it('home is the patient screen for the default room', async () => {
    renderAt('/')
    expect(await screen.findByRole('heading', { name: /hi maya/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Room 401')).toBeInTheDocument()
  })

  it.each(['nursing', 'housekeeping', 'food', 'it'])('/%s is that department’s dashboard', async (dept) => {
    renderAt(`/${dept}`)
    expect(await screen.findByLabelText(/department pin/i)).toBeInTheDocument()
  })

  it('old /staff/<dept> links redirect to /<dept>', async () => {
    renderAt('/staff/food')
    expect(await screen.findByTestId('path')).toHaveTextContent(/^\/food$/)
    expect(screen.getByLabelText(/department pin/i)).toBeInTheDocument()
  })

  it('unknown paths go back to the patient screen', async () => {
    renderAt('/some/where/else')
    expect(await screen.findByTestId('path')).toHaveTextContent(/^\/$/)
  })
})
