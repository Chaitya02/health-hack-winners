import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdle } from './useIdle'

const fire = (type: string) => act(() => void window.dispatchEvent(new Event(type)))

describe('useIdle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('goes idle after the timeout and activity before then restarts the countdown', () => {
    const { result } = renderHook(() => useIdle(1000))
    act(() => vi.advanceTimersByTime(900))
    fire('pointerdown')
    act(() => vi.advanceTimersByTime(900))
    expect(result.current.idle).toBe(false)
    act(() => vi.advanceTimersByTime(100))
    expect(result.current.idle).toBe(true)
  })

  it('ignores taps while idle (they must land on the screensaver) but wakes on keys and wake()', () => {
    const { result } = renderHook(() => useIdle(1000))
    act(() => vi.advanceTimersByTime(1000))
    fire('pointerdown')
    expect(result.current.idle).toBe(true)
    fire('keydown')
    expect(result.current.idle).toBe(false)
    act(() => vi.advanceTimersByTime(1000))
    act(() => result.current.wake())
    expect(result.current.idle).toBe(false)
  })

  it('never goes idle while disabled', () => {
    const { result } = renderHook(() => useIdle(1000, false))
    act(() => vi.advanceTimersByTime(10_000))
    expect(result.current.idle).toBe(false)
  })
})
