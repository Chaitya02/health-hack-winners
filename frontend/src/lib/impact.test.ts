import { describe, expect, it } from 'vitest'
import { computeImpact, DEFAULT_INPUTS } from './impact'
import { aging, formatWait } from './time'

describe('impact model', () => {
  it('computes annual nursing hours and dollars for the default 30-bed unit', () => {
    const r = computeImpact(DEFAULT_INPUTS)
    // 30 beds × 10 calls × 60% = 180 diverted/day; × 365 × 4 min / 60 = 4,380 h
    expect(r.divertedPerDay).toBe(180)
    expect(r.hoursPerYear).toBeCloseTo(4380)
    expect(r.dollarsPerYear).toBeCloseTo(262800)
    expect(r.fte).toBeCloseTo(2.11, 2)
    expect(r.interruptionsAvoidedPerNurseShift).toBeCloseTo(15)
  })
  it('scales linearly to a 500-bed hospital', () => {
    expect(computeImpact(DEFAULT_INPUTS, 500).hoursPerYear).toBeCloseTo(73000)
  })
  it('handles zero inputs', () => {
    expect(computeImpact({ ...DEFAULT_INPUTS, beds: 0 }).hoursPerYear).toBe(0)
  })
})

describe('waiting time', () => {
  it('ages green < 5m, amber < 10m, red ≥ 10m', () => {
    expect(aging(299)).toBe('fresh')
    expect(aging(300)).toBe('waiting')
    expect(aging(599)).toBe('waiting')
    expect(aging(600)).toBe('late')
  })
  it('formats m:ss', () => {
    expect(formatWait(65)).toBe('1:05')
    expect(formatWait(3700)).toBe('1h 1m')
  })
})
