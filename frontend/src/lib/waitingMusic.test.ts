import { afterEach, describe, expect, it, vi } from 'vitest'
import { isMusicPlaying, startMusic, stopMusic } from './waitingMusic'

const node = () => ({ connect: vi.fn((n: unknown) => n), disconnect: vi.fn() })

class FakeAudioContext {
  static oscillators = 0
  currentTime = 0
  destination = {}
  resume = vi.fn(async () => {})
  createGain() {
    return { ...node(), gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } }
  }
  createOscillator() {
    FakeAudioContext.oscillators += 1
    return { ...node(), type: '', frequency: { value: 0 }, start: vi.fn(), stop: vi.fn() }
  }
}

afterEach(() => {
  stopMusic()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('waitingMusic', () => {
  it('plays a quiet loop until stopped, and start is idempotent', () => {
    vi.useFakeTimers()
    vi.stubGlobal('AudioContext', FakeAudioContext)
    FakeAudioContext.oscillators = 0
    startMusic()
    startMusic()
    expect(isMusicPlaying()).toBe(true)
    expect(FakeAudioContext.oscillators).toBe(1)
    vi.advanceTimersByTime(2700)
    expect(FakeAudioContext.oscillators).toBe(4)
    stopMusic()
    expect(isMusicPlaying()).toBe(false)
    vi.advanceTimersByTime(5000)
    expect(FakeAudioContext.oscillators).toBe(4)
  })

  it('does nothing where Web Audio is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined)
    expect(() => startMusic()).not.toThrow()
    expect(() => stopMusic()).not.toThrow()
  })
})
