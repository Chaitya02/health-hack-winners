import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SCREENSAVER } from '../../i18n/screensaver'
import { STRINGS } from '../../i18n/strings'
import type { PatientTicketView } from '../../types/ticket'
import { Screensaver } from './Screensaver'

const view = (id: string, status: PatientTicketView['status'], department: PatientTicketView['department']) =>
  ({ ticket_id: id, status, department, created_at: '2026-10-10T10:00:00Z' }) as PatientTicketView

function renderSaver(lang: 'en' | 'es' = 'en') {
  const onWake = vi.fn()
  const onNurse = vi.fn()
  render(
    <Screensaver
      roomId="401"
      lang={lang}
      t={STRINGS[lang]}
      requests={[view('a', 'IN_PROGRESS', 'housekeeping'), view('b', 'RESOLVED', 'food'), view('c', 'CANCELLED', 'it')]}
      nurse="Nurse Jordan"
      onWake={onWake}
      onNurse={onNurse}
    />,
  )
  return { onWake, onNurse }
}

describe('Screensaver', () => {
  it('keeps open requests and the nurse button on screen', () => {
    renderSaver()
    expect(screen.getByRole('dialog', { name: 'Screensaver' })).toBeInTheDocument()
    expect(screen.getByText('Housekeeping')).toBeInTheDocument()
    expect(screen.getByText('On the way')).toBeInTheDocument()
    expect(screen.queryByText('Food Services')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^emergency$/i })).toBeEnabled()
  })

  it('shows the patient’s nurse and how long each open request has waited', () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-10T10:07:30Z') })
    renderSaver()
    expect(screen.getByTestId('screensaver-nurse')).toHaveTextContent('Your nurse: Jordan')
    expect(screen.getAllByTestId('screensaver-wait').map((n) => n.textContent)).toEqual(['Waiting 7 min'])
    vi.useRealTimers()
  })

  it('waiting time in the patient’s language', () => {
    expect(SCREENSAVER.es.waited(0)).toBe('Recién enviado')
    expect(SCREENSAVER.zh.waited(12)).toBe('已等待 12 分钟')
  })

  it('a tap anywhere wakes; Emergency (tapped twice) calls the nurse instead', async () => {
    const { onWake, onNurse } = renderSaver()
    await userEvent.click(screen.getByRole('button', { name: /^emergency$/i }))
    expect(onNurse).not.toHaveBeenCalled() // first tap only asks
    await userEvent.click(screen.getByRole('button', { name: /^emergency$/i }))
    expect(onNurse).toHaveBeenCalledOnce()
    expect(onWake).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Tap anywhere to continue' }))
    expect(onWake).toHaveBeenCalledOnce()
  })

  it('rotates tips in the patient’s language', () => {
    vi.useFakeTimers()
    renderSaver('es')
    const tips = SCREENSAVER.es.tips
    expect(screen.getByTestId('screensaver-tip')).toHaveTextContent(tips[0])
    act(() => vi.advanceTimersByTime(8000))
    expect(screen.getByTestId('screensaver-tip')).toHaveTextContent(tips[1])
    expect(screen.getByRole('button', { name: SCREENSAVER.es.tapToContinue })).toHaveFocus()
    vi.useRealTimers()
  })
})
