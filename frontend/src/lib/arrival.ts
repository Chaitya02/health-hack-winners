import { minutesLeft } from '../components/patient/RequestTracker'
import { TRACKER } from '../i18n/tracker'
import type { Language, PatientTicketView, Status } from '../types/ticket'

const COMING: Status[] = ['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'ESCALATED']

/**
 * "Someone will be with you in about 4 minutes." for a request that is still on its way, from its
 * ETA counted down from when it was sent; "very soon" once that time is up. Null when the request
 * is closed or has no ETA.
 */
export function arrivalSentence(
  r: Pick<PatientTicketView, 'status' | 'created_at' | 'eta_minutes'>,
  lang: Language,
  now: number,
): string | null {
  if (!COMING.includes(r.status)) return null
  const left = minutesLeft(r, now)
  if (left == null) return null
  return left >= 1 ? TRACKER[lang].arriving(left) : TRACKER[lang].arrivingSoon
}
