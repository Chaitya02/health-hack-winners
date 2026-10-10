import type { Strings } from '../../i18n/strings'
import type { CreateRequestResponse, PatientProfile } from '../../types/ticket'
import type { QuickTile } from './RequestTiles'

/**
 * Food and drink tiles (DIETARY in backend/app/tiles.py). The server refuses them for NPO rooms
 * (C3, 409 "npo"); the UI grays them out first. Medication is clinical and stays available.
 */
export const NPO_TILES: readonly QuickTile[] = ['water', 'ice', 'food']

/** Tiles the patient's profile rules out, with the explanation shown when one is tapped. */
export function blockedTiles(profile: PatientProfile | undefined, t: Strings): Partial<Record<QuickTile, string>> {
  if (!profile?.npo) return {}
  return Object.fromEntries(NPO_TILES.map((k) => [k, t.npoBlocked]))
}

/** True when a profile rule raised this request's priority (fall risk, US-5). */
export const raisedForFallRisk = (res: CreateRequestResponse) =>
  res.tickets.some((x) => x.safety_reasons.includes('fall_risk'))

/** The patient-language message from a C3 profile refusal (409), if that's what this error is. */
export function profileRefusalMessage(status: number, detail: string): string | null {
  if (status !== 409) return null
  try {
    const body = JSON.parse(detail) as { code?: string; message?: string }
    return body.code && body.message ? body.message : null
  } catch {
    return null
  }
}
