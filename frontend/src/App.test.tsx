import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from './App'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('routes', () => {
  it('renders the patient page', () => {
    renderAt('/patient/401')
    expect(screen.getByRole('heading', { name: /room 401/i })).toBeInTheDocument()
  })
  it('renders a staff page', () => {
    renderAt('/staff/housekeeping')
    expect(screen.getByRole('heading', { name: /housekeeping/i })).toBeInTheDocument()
  })
  it('renders the admin page', () => {
    renderAt('/admin')
    expect(screen.getByRole('heading', { name: /impact/i })).toBeInTheDocument()
  })
})
