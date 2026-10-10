import type { QuickTile } from '../components/patient/RequestTiles'
import type { PatientProfile, PatientTicketView } from '../types/ticket'

/** Every request button except the nurse button, in default order (most commonly needed first). */
export const ALL_TILES: QuickTile[] = [
  'water',
  'pillow',
  'bathroom',
  'blanket',
  'food',
  'medication',
  'tv',
  'temperature',
  'ice',
  'counseling',
  'family',
  'spiritual',
]

const DIETARY = new Set<QuickTile>(['water', 'ice', 'food'])

/**
 * The patient's top buttons: the clinical notes set the starting order (profile.priority_tiles,
 * from the intake), then the buttons this patient actually uses rise. NPO patients never get
 * food or drink in the top list.
 */
export function topTiles(
  profile: Pick<PatientProfile, 'priority_tiles' | 'npo'> | undefined,
  requests: Pick<PatientTicketView, 'tile'>[],
  count = 3,
): { top: QuickTile[]; rest: QuickTile[] } {
  const fromNotes = (profile?.priority_tiles ?? []).filter((t): t is QuickTile => (ALL_TILES as string[]).includes(t))
  const uses = new Map<string, number>()
  for (const r of requests) if (r.tile) uses.set(r.tile, (uses.get(r.tile) ?? 0) + 1)

  const score = (tile: QuickTile) => {
    const noted = fromNotes.indexOf(tile)
    return (
      (noted === -1 ? 0 : 100 - noted * 10) + // clinical notes
      (uses.get(tile) ?? 0) * 25 + // each use today counts for a lot
      (ALL_TILES.length - ALL_TILES.indexOf(tile)) / 100 // default order breaks ties
    )
  }
  const eligible = ALL_TILES.filter((t) => !(profile?.npo && DIETARY.has(t)))
  const top = [...eligible].sort((a, b) => score(b) - score(a)).slice(0, count)
  return { top, rest: ALL_TILES.filter((t) => !top.includes(t)) }
}
