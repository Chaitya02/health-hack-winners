import type { Procedure } from '../types/ticket'

/** How far ahead the "soon" reminder fires, and how long "now" lasts after the start time. */
export const SOON_MIN = 15
export const NOW_FOR_MIN = 30

export type ProcedureStage = 'scheduled' | 'soon' | 'now' | 'past'
const ORDER: ProcedureStage[] = ['scheduled', 'soon', 'now']

export function procedureStage(p: Procedure, now: number): { stage: ProcedureStage; minutes: number } {
  const minutes = Math.ceil((Date.parse(p.at) - now) / 60_000)
  if (minutes <= -NOW_FOR_MIN) return { stage: 'past', minutes }
  if (minutes <= 0) return { stage: 'now', minutes }
  if (minutes <= SOON_MIN) return { stage: 'soon', minutes }
  return { stage: 'scheduled', minutes }
}

/** Earlier stages a stage covers: arriving at "soon" also counts "scheduled" as told. */
export function stagesUpTo(stage: ProcedureStage): ProcedureStage[] {
  return stage === 'past' ? ORDER : ORDER.slice(0, ORDER.indexOf(stage) + 1)
}

/** "3:40 PM" today, "Saturday 9:00 AM" on another day, in the patient's language. */
export function procedureTime(iso: string, locale: string, now: number): string {
  const at = new Date(iso)
  const sameDay = at.toDateString() === new Date(now).toDateString()
  return new Intl.DateTimeFormat(locale, {
    ...(sameDay ? {} : { weekday: 'long' }),
    hour: 'numeric',
    minute: '2-digit',
  }).format(at)
}
