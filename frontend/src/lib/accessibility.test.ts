import { describe, expect, it } from 'vitest'
import type { PatientProfile } from '../types/ticket'
import { DEFAULT_LAYOUT, layoutFor } from './accessibility'

const profile = (a: Partial<PatientProfile['accessibility']>): PatientProfile => ({
  npo: false,
  npo_reason: null,
  fall_risk: false,
  diet: null,
  attendant_preference: 'any',
  dashboard: 'standard',
  priority_tiles: [],
  notes_flags: [],
  accessibility: { low_vision: false, speech_difficulty: false, cannot_write: false, ...a },
})

describe('layoutFor', () => {
  it.each([
    ['no profile yet', null, DEFAULT_LAYOUT],
    ['no flags', profile({}), DEFAULT_LAYOUT],
    ['low vision', profile({ low_vision: true }), { showText: false, showMic: true, large: true, readAloud: true }],
    ['speech difficulty', profile({ speech_difficulty: true }), { showText: true, showMic: false, large: false, readAloud: false }],
    ['cannot write', profile({ cannot_write: true }), { showText: false, showMic: true, large: false, readAloud: false }],
    [
      'speech difficulty + cannot write → buttons only',
      profile({ speech_difficulty: true, cannot_write: true }),
      { showText: false, showMic: false, large: false, readAloud: false },
    ],
  ])('%s', (_name, p, expected) => {
    expect(layoutFor(p)).toEqual(expected)
  })
})
