import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmergencyButton } from './EmergencyButton'

afterEach(() => vi.useRealTimers())

describe('EmergencyButton', () => {
  it('first tap shows a toast (and can read it aloud); the same button again sends', async () => {
    const onConfirm = vi.fn()
    const onArm = vi.fn()
    render(<EmergencyButton lang="es" busy={false} onConfirm={onConfirm} onArm={onArm} />)
    const button = screen.getByRole('button', { name: 'Emergencia' })
    await userEvent.click(button)
    expect(screen.getByTestId('emergency-toast')).toHaveTextContent('Toque Emergencia otra vez')
    expect(onArm).toHaveBeenCalledWith('Toque Emergencia otra vez para llamar a su enfermera.')
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // a toast, not a popup
    await userEvent.click(button)
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('emergency-toast')).not.toBeInTheDocument()
  })

  it('disarms after 10 seconds without a second tap', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const onConfirm = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<EmergencyButton lang="en" busy={false} onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Emergency' }))
    act(() => vi.advanceTimersByTime(10_000))
    expect(screen.queryByTestId('emergency-toast')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Emergency' }))
    expect(onConfirm).not.toHaveBeenCalled() // that was a new first tap
  })
})
