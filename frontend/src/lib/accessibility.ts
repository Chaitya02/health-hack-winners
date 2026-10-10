import type { PatientProfile } from '../types/ticket'

export interface PatientLayout {
  /** Free-text box. */
  showText: boolean
  /** Speech-to-text microphone. */
  showMic: boolean
  /** Extra-large, high-contrast buttons and text. */
  large: boolean
  /** Speak button labels and the confirmation aloud. */
  readAloud: boolean
}

export const DEFAULT_LAYOUT: PatientLayout = { showText: true, showMic: true, large: false, readAloud: false }

/**
 * US-4: tailor the patient screen to the care team's accessibility flags. Buttons are always
 * shown and the nurse button is never affected.
 * - Low vision: no text box; keep the mic (speaking is easiest); large buttons; read aloud.
 * - Speech difficulty: no mic; buttons and text.
 * - Can't write: no text box; buttons and voice.
 */
export function layoutFor(profile: PatientProfile | undefined | null): PatientLayout {
  const a = profile?.accessibility
  if (!a) return DEFAULT_LAYOUT
  return {
    showText: !a.low_vision && !a.cannot_write,
    showMic: !a.speech_difficulty,
    large: a.low_vision,
    readAloud: a.low_vision,
  }
}
