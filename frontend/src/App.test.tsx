import { render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from './App'
import { mockFetch } from './test/fixtures'

const ROOM = { room_id: '400', unit: '4 West Med-Surg', patient_alias: '', preferred_language: 'en', primary_nurse: 'N', intake_complete: false }

function Where() {
  return <output data-testid="path">{useLocation().pathname}</output>
}

function renderAt(path: string) {
  mockFetch({ 'GET /api/rooms/400/tickets': [], 'GET /api/rooms/400': ROOM, 'GET /api/metrics': {} })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Where />
    </MemoryRouter>,
  )
}

describe('App routes', () => {
  it('home is the bedside intake form for the demo room (400)', async () => {
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'Welcome' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^your name/i)).toBeInTheDocument()
    // Every staff and admin screen is one tap away (new tab).
    const nav = screen.getByRole('navigation', { name: 'Staff and admin screens' })
    const links = Array.from(nav.querySelectorAll('a')).map((a) => [a.textContent?.replace('↗', '').trim(), a.getAttribute('href'), a.target])
    expect(links).toEqual([
      ['Primary Nurse', '/nursing', '_blank'],
      ['Housekeeping & Facilities', '/housekeeping', '_blank'],
      ['Food Services', '/food', '_blank'],
      ['Unit Clerk / IT', '/it', '_blank'],
      ['Admin & insights', '/admin', '_blank'],
    ])
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
