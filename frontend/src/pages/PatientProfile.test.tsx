import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { blockedTiles, NPO_TILES, profileRefusalMessage } from '../components/patient/profileRules'
import { STRINGS } from '../i18n/strings'
import { mockFetch, ticket } from '../test/fixtures'
import type { PatientProfile } from '../types/ticket'
import PatientPage from './PatientPage'

const NPO_MSG = 'You can’t eat or drink right now. Ask your nurse if you have questions.'

function profile(p: Partial<PatientProfile>): PatientProfile {
  return {
    npo: false,
    npo_reason: null,
    fall_risk: false,
    diet: null,
    accessibility: { low_vision: false, speech_difficulty: false, cannot_write: false },
    attendant_preference: 'any',
    ...p,
  }
}

const room = (p: Partial<PatientProfile>) => ({
  room_id: '410',
  unit: '4 West Med-Surg',
  patient_alias: 'Sam',
  preferred_language: 'en',
  primary_nurse: 'N',
  profile: profile(p),
})

function renderRoom() {
  return render(
    <MemoryRouter initialEntries={['/patient/410']}>
      <Routes>
        <Route path="/patient/:roomId" element={<PatientPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Patient profile gray-out (US-5)', () => {
  it('NPO: Thirsty is grayed out and tapping it explains why without sending anything', async () => {
    const calls = mockFetch({ 'GET /api/rooms/410/tickets': [], 'GET /api/rooms/410': room({ npo: true }) })
    renderRoom()
    await screen.findByRole('heading', { name: /hi sam/i })
    const thirsty = await screen.findByRole('button', { name: 'Thirsty' })
    await waitFor(() => expect(thirsty).toHaveAttribute('aria-disabled', 'true'))
    await userEvent.click(thirsty)
    expect(screen.getByTestId('tile-notice')).toHaveTextContent(NPO_MSG)
    expect(screen.queryByRole('heading', { name: 'Thirsty' })).not.toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
    expect(screen.getByRole('button', { name: /i need my nurse/i })).toBeEnabled()
  })

  it('NPO: Food & medication stays open; Food is grayed out, Medication still sends', async () => {
    const calls = mockFetch({
      'GET /api/rooms/410/tickets': [],
      'GET /api/rooms/410': room({ npo: true }),
      'POST /api/requests': {
        request_id: 'r_m',
        tickets: [ticket({ department: 'nursing', category: 'NON_URGENT_CLINICAL' })],
        confirmation: 'Your nurse has your request.',
        confirmation_language: 'en',
        is_clinical: false,
      },
    })
    renderRoom()
    await screen.findByRole('heading', { name: /hi sam/i })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Thirsty' })).toHaveAttribute('aria-disabled', 'true'))
    const group = screen.getByRole('button', { name: 'Food & medication' })
    expect(group).not.toHaveAttribute('aria-disabled')
    await userEvent.click(group)
    await userEvent.click(screen.getByRole('button', { name: 'Food / menu' }))
    expect(screen.getByTestId('tile-notice')).toHaveTextContent(NPO_MSG)
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Medication' }))
    await screen.findByTestId('confirmation')
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ tile: 'medication' })
  })

  it('no profile flags: nothing is grayed out', async () => {
    mockFetch({ 'GET /api/rooms/410/tickets': [], 'GET /api/rooms/410': room({}) })
    renderRoom()
    await screen.findByRole('heading', { name: /hi sam/i })
    expect(document.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0)
  })

  it('shows the server’s NPO refusal (409) in the patient’s language if the screen was out of date', async () => {
    const detail = { code: 'npo', reason: null, message: 'Ahora no puede comer ni beber.' }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input).replace('http://api.test', '')
        const json = (b: unknown, status = 200) =>
          new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
        if (init?.method === 'POST') return json({ detail }, 409)
        if (path.endsWith('/tickets')) return json([])
        return json(room({}))
      }),
    )
    renderRoom()
    await screen.findByRole('heading', { name: /hi sam/i })
    await userEvent.click(screen.getByRole('button', { name: 'Thirsty' }))
    await userEvent.click(screen.getByRole('button', { name: 'Water' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ahora no puede comer ni beber.')
  })

  it('fall risk: a raised request shows "Marked higher priority" with the server message', async () => {
    mockFetch({
      'GET /api/rooms/410/tickets': [],
      'GET /api/rooms/410': room({ fall_risk: true }),
      'POST /api/requests': {
        request_id: 'r_b',
        tickets: [ticket({ department: 'nursing', priority: 'HIGH', safety_reasons: ['fall_risk'] })],
        confirmation: 'Your nurse has your request. Because of your fall risk this is a priority.',
        confirmation_language: 'en',
        is_clinical: false,
      },
    })
    renderRoom()
    await userEvent.click(await screen.findByRole('button', { name: 'Help to the bathroom' }))
    const box = await screen.findByTestId('confirmation')
    expect(screen.getByTestId('higher-priority')).toHaveTextContent('Marked higher priority')
    expect(box).toHaveTextContent(/fall risk/i)
  })

  it('no badge when nothing was raised', async () => {
    mockFetch({
      'GET /api/rooms/410/tickets': [],
      'GET /api/rooms/410': room({}),
      'POST /api/requests': {
        request_id: 'r_p',
        tickets: [ticket()],
        confirmation: 'Housekeeping is on the way.',
        confirmation_language: 'en',
        is_clinical: false,
      },
    })
    renderRoom()
    await userEvent.click(await screen.findByRole('button', { name: 'Comfort' }))
    await userEvent.click(screen.getByRole('button', { name: 'Pillow' }))
    await screen.findByTestId('confirmation')
    expect(screen.queryByTestId('higher-priority')).not.toBeInTheDocument()
  })

  it('the nurse button stays enabled while another request is sending', async () => {
    let release: () => void = () => {}
    const pending = new Promise<void>((r) => (release = r))
    const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { 'content-type': 'application/json' } })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          await pending
          return json({ request_id: 'r', tickets: [ticket()], confirmation: 'ok', confirmation_language: 'en', is_clinical: false })
        }
        return json(String(input).endsWith('/tickets') ? [] : room({}))
      }),
    )
    renderRoom()
    await userEvent.click(await screen.findByRole('button', { name: 'Comfort' }))
    await userEvent.click(screen.getByRole('button', { name: 'Pillow' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Blanket' })).toBeDisabled())
    expect(screen.getByRole('button', { name: /i need my nurse/i })).toBeEnabled()
    release()
  })
})

describe('profileRules', () => {
  it('blocks exactly the food and drink tiles when NPO', () => {
    const t = STRINGS.en
    expect(Object.keys(blockedTiles(profile({ npo: true }), t)).sort()).toEqual([...NPO_TILES].sort())
    expect(blockedTiles(profile({ npo: true }), t).water).toBe(NPO_MSG)
    expect(blockedTiles(profile({}), t)).toEqual({})
    expect(blockedTiles(undefined, t)).toEqual({})
    expect(NPO_TILES).not.toContain('medication')
  })

  it('every language has the NPO explanation and the priority badge', () => {
    for (const s of Object.values(STRINGS)) {
      expect(s.npoBlocked.length).toBeGreaterThan(10)
      expect(s.higherPriority.length).toBeGreaterThan(3)
    }
  })

  it('parses only profile refusals out of 409 details', () => {
    expect(profileRefusalMessage(409, JSON.stringify({ code: 'npo', reason: null, message: 'm' }))).toBe('m')
    expect(profileRefusalMessage(409, 'ticket is already resolved')).toBeNull()
    expect(profileRefusalMessage(500, JSON.stringify({ code: 'npo', message: 'm' }))).toBeNull()
  })
})
