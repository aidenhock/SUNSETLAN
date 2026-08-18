import data from './placements.json'

/**
 * THE WORLD PLACEMENT FILE (see placements.json for the data and the
 * editing notes). Every placed thing on the island — interactables,
 * props, NPCs, seats, structures, scattered nature — carries its
 * lat/long, the direction it faces, its scale and its blocker radius
 * here. The scene builds from this list and the blockers regenerate
 * from it, so the world can be rearranged without touching scene code.
 *
 * Two ways to edit: by hand, or open the world with `?editor` in dev,
 * drag things around, and write the file back out.
 *
 * Angle convention: `yawDeg` is measured from local NORTH (uphill,
 * toward the pole), positive turning east — the same base `meridianYaw`
 * establishes. Degrees here because a human edits this file; radians at
 * the consumer.
 *
 * ALTITUDE IS NEVER STORED. Everything sits at
 * `groundAltitudeAt(lat, long) - SINK_M + (liftM ?? 0)`, which is what
 * keeps props from floating at the horizon and sinking up close
 * (placement rule 1).
 */

export type PlacementKind = 'interactable' | 'prop' | 'npc' | 'seat' | 'structure' | 'scatter'

export interface Placement {
  id: string
  /** What renders here — see `PROP_REGISTRY` for the spawnable set. */
  type: string
  kind: PlacementKind
  /** Human name, for the editor and the index docs. */
  label: string
  lat: number
  long: number
  /** Yaw in DEGREES from local north, positive toward east. */
  yawDeg: number
  scale: number
  /** Movement blocker radius in metres; omit for no collision. */
  blockerRadiusM?: number
  /** Extra metres above the ground (things on furniture, or floating). */
  liftM?: number
  /** Footprint for structures (the cemetery's fenced plot). */
  size?: { widthM: number; depthM: number }
  notes?: string
}

export const placements: Placement[] = data.placements as Placement[]

const byId = new Map(placements.map((p) => [p.id, p]))

/** Look up a placement, loudly — a typo'd id is a bug, not a blank spot. */
export function placement(id: string): Placement {
  const p = byId.get(id)
  if (!p) throw new Error(`placements.json has no placement with id "${id}"`)
  return p
}

/** Its lat/long, in the shape planetConfig's MAP entries use. */
export function placementPos(id: string): { lat: number; long: number } {
  const p = placement(id)
  return { lat: p.lat, long: p.long }
}

/** Its facing in radians, ready for a rotation. */
export function placementYaw(id: string): number {
  return (placement(id).yawDeg * Math.PI) / 180
}

export const placementsOfKind = (kind: PlacementKind) => placements.filter((p) => p.kind === kind)
export const placementsOfType = (type: string) => placements.filter((p) => p.type === type)
