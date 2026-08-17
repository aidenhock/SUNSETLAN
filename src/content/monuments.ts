import data from './monuments.json'

/**
 * THE WORLD INDEX (see monuments.json for the data and the editing
 * notes). Every placed thing on the island — interactables, props,
 * NPCs, seats, structures — carries its lat/long and the direction it
 * faces in ONE file, so the world can be rearranged without touching
 * scene code. `planetConfig.MAP` derives from this, and every consumer
 * of MAP therefore follows automatically.
 *
 * Angle convention: `facingDeg` is yaw RELATIVE TO LOCAL NORTH (uphill,
 * toward the pole) — the same base `meridianYaw` establishes — with
 * positive turning east. It is degrees here (readable when editing) and
 * converted to radians at the consumer.
 */

export type MonumentKind = 'interactable' | 'prop' | 'npc' | 'seat' | 'structure'

export interface Monument {
  id: string
  kind: MonumentKind
  /** Human name, for the index docs and the editor's own sanity. */
  label: string
  lat: number
  long: number
  /** Yaw in DEGREES from local north, positive toward east. */
  facingDeg: number
  /** Extra metres above the analytic ground (things on furniture). */
  liftM?: number
  /** Footprint for structures (the cemetery's fenced plot). */
  size?: { widthM: number; depthM: number }
  notes?: string
}

export const monuments: Monument[] = data.monuments as Monument[]

const byId = new Map(monuments.map((m) => [m.id, m]))

/** Look up a monument, loudly — a typo'd id is a bug, not a blank spot. */
export function monument(id: string): Monument {
  const m = byId.get(id)
  if (!m) throw new Error(`monuments.json has no monument with id "${id}"`)
  return m
}

/** Its lat/long, in the shape planetConfig's MAP entries use. */
export function monumentPos(id: string): { lat: number; long: number } {
  const m = monument(id)
  return { lat: m.lat, long: m.long }
}

/** Its facing in radians, ready for a rotation. */
export function monumentYaw(id: string): number {
  return (monument(id).facingDeg * Math.PI) / 180
}

export const monumentsOfKind = (kind: MonumentKind) => monuments.filter((m) => m.kind === kind)
