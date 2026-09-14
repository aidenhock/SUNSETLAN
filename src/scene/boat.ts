import * as THREE from 'three'
import { latLongToUnit } from '../controls/planetMath'
import { IDENTITY_Q, surfacePartMatrix } from './instancing'
import {
  BOAT,
  DOCK,
  landmassAt,
  PLANET_RADIUS,
  polarFromOwnPole,
  SOUTH,
  SOUTH_DOCK,
  TERRAIN,
  type Blocker,
} from './planetConfig'

/**
 * The boat: where it moors, and how it moves.
 *
 * Nothing here is PLACED. A mooring is DERIVED from its dock — the
 * far-end plank's centre, stepped sideways into open water — so moving a
 * dock moves the boat with it and the two can never disagree, exactly
 * like the seats derive from the logs (scene/seats.ts).
 *
 * The physics is pure: `advanceBoat` turns input into a heading, a speed
 * and the arc angle to travel this frame, and the controller turns that
 * arc into the SAME rotationStep/applyStep the walk uses. The boat never
 * moves; the world does.
 */

export type DockName = 'north' | 'south'

const DOCKS: Record<DockName, typeof DOCK> = { north: DOCK, south: SOUTH_DOCK }

/** The far-end plank centre ON the strip: where you stand when you step
 *  off the boat, and what "near a dock" measures against. Both sit a
 *  little inside the strip's seaward end so the deck is really underfoot. */
const END_LAT: Record<DockName, number> = { north: 13.4, south: -66.4 }

/**
 * Latitude of the dock's LAST segment centre — the seaward end. The
 * island's dock runs toward DECREASING latitude (24 → 13), Antarctica's
 * toward increasing (−70 → −66); either way the far end is the one over
 * open water. Mirrors buildDockGeometry's segment walk in Island.tsx.
 */
function farEndSegmentLat(name: DockName): number {
  const d = DOCKS[name]
  const half = (d.latMaxDeg - d.latMinDeg) / d.segmentCount / 2
  return name === 'north' ? d.latMinDeg + half : d.latMaxDeg - half
}

/**
 * The mooring, planet-local. `surfacePartMatrix` builds a frame whose
 * +Y is up and +Z is north — which makes +X WEST, and Koa sits on the
 * north dock's west edge with his legs over the water. The boat moors on
 * the other side, so the offset is local −x (east).
 */
export function mooringUnit(dock: DockName): THREE.Vector3 {
  const d = DOCKS[dock]
  const m = surfacePartMatrix(
    farEndSegmentLat(dock),
    d.longDeg,
    0,
    0,
    new THREE.Vector3(-BOAT.mooringSideM, 0, 0),
    IDENTITY_Q,
    1,
  )
  return new THREE.Vector3().setFromMatrixPosition(m).normalize()
}

/** The mooring as lat/long, so the moored boat can be placed with the
 *  usual meridian-aligned surface matrix (event time; allocates). */
export function mooringLatLong(dock: DockName): { lat: number; long: number } {
  const u = mooringUnit(dock)
  const polar = Math.acos(THREE.MathUtils.clamp(u.y, -1, 1))
  return {
    lat: 90 - THREE.MathUtils.radToDeg(polar),
    long: THREE.MathUtils.radToDeg(Math.atan2(u.x, u.z)),
  }
}

/**
 * Bow yaw for the moored boat: pointing AWAY from land, down the
 * meridian toward open water. Local +Z is north, so the island's boat
 * faces south (π) and Antarctica's faces north (0).
 */
export function mooringYaw(dock: DockName): number {
  return dock === 'north' ? Math.PI : 0
}

/** The far-end plank centre, planet-local — and the spot you stand on
 *  when you tie up. Step-off IS the dock end: the deck is right there. */
export function dockEndUnit(dock: DockName): THREE.Vector3 {
  return latLongToUnit(END_LAT[dock], DOCKS[dock].longDeg)
}

export function stepOffUnit(dock: DockName): THREE.Vector3 {
  return dockEndUnit(dock)
}

/** Derived once at module load — the frame loop never builds these. */
export const MOORING_UNITS: Record<DockName, THREE.Vector3> = {
  north: mooringUnit('north'),
  south: mooringUnit('south'),
}

/**
 * The same two moorings as lat/long, derived once. `onBoatDeck` runs
 * every frame out of groundHeightAt, so the frame loop must never build
 * a Vector3 to ask where the boat is — it reads these numbers instead.
 */
export const MOORING_LATLONG: Record<DockName, { lat: number; long: number }> = {
  north: mooringLatLong('north'),
  south: mooringLatLong('south'),
}

/**
 * Which mooring currently holds the boat, or null while it is being
 * boarded, driven or tied up (then the hull is at the pole under the
 * player, not out here on the water). Terrain asks this to decide
 * whether the deck is walkable; the store pushes every change in (see
 * useStore's syncMooredBoat) so the two can never drift. The initial
 * value mirrors the store's initial boat state.
 */
let mooredDock: DockName | null = 'north'

export function setMooredBoat(dock: DockName | null): void {
  mooredDock = dock
}

export function mooredBoatDock(): DockName | null {
  return mooredDock
}
export const DOCK_END_UNITS: Record<DockName, THREE.Vector3> = {
  north: dockEndUnit('north'),
  south: dockEndUnit('south'),
}
export const DOCK_NAMES: readonly DockName[] = ['north', 'south']

/**
 * Boat-mode blockers: every plank centre of both docks, fat enough that
 * you cannot drive THROUGH a dock (deck half-width plus most a hull).
 * The mooring itself sits inside the far plank's radius — it is reached
 * by the boarding tween, which ignores blockers, and left freely because
 * blockers only ever cancel steps that move you CLOSER.
 */
export const BOAT_BLOCKERS: Blocker[] = DOCK_NAMES.flatMap((name) => {
  const d = DOCKS[name]
  const span = (d.latMaxDeg - d.latMinDeg) / d.segmentCount
  return Array.from({ length: d.segmentCount }, (_, i) => ({
    unit: latLongToUnit(d.latMaxDeg - span * (i + 0.5), d.longDeg),
    // + 0.6: the mooring (1.7 m off the centreline) must sit OUTSIDE
    // this radius or the boat starts inside its own blocker and a
    // heading toward the pier can never leave; the hull (half-width
    // ~0.55) still clears the deck edge (1.0) at 1.6 m.
    radius: d.halfWidthM + 0.6,
  }))
})

/** How close to its own pole a landmass lets the boat come: its
 *  waterline plus a margin, so the hull never grinds up the beach. */
function shoreLimitRad(landmass: DockName): number {
  const waterlineDeg = landmass === 'north' ? TERRAIN.waterlineDeg : SOUTH.waterlineDeg
  return THREE.MathUtils.degToRad(waterlineDeg) + BOAT.shoreMarginM / PLANET_RADIUS
}

/**
 * The boat's answer to `stepLeavesLandmass`: cancel a step that carries
 * the boat INSIDE either landmass's shore limit AND closer than it
 * already was. Leaving is therefore always legal — a boat nudged onto a
 * shoal can always reverse off it.
 */
export function boatStepBlocked(polarBefore: number, polarAfter: number): boolean {
  const before = polarFromOwnPole(polarBefore)
  const after = polarFromOwnPole(polarAfter)
  return after < shoreLimitRad(landmassAt(polarAfter)) && after < before
}

export interface BoatMotion {
  /** World yaw the bow points along (radians, atan2(x, z)). */
  heading: number
  /** Metres per second along that heading. */
  speed: number
}

export interface BoatInput {
  /** World yaw the player is asking for, or null for no input. */
  dirYaw: number | null
  /** Input magnitude, 0..1. */
  mag: number
}

export interface BoatTuning {
  maxSpeedMps: number
  accelMps2: number
  decelMps2: number
  turnRateRadPerS: number
}

/** Wrap to (−π, π]. */
function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

/**
 * One frame of boat motion, in place. With input the heading eases
 * toward `dirYaw` the SHORT way at the turn rate and the speed climbs
 * toward maxSpeed × mag; with none the speed falls to zero. Returns the
 * arc angle (radians) to travel this frame — the controller rotates the
 * world along the HEADING by that much, never along the raw input, so
 * the boat carries its momentum through a turn.
 */
export function advanceBoat(
  m: BoatMotion,
  input: BoatInput,
  dt: number,
  cfg: BoatTuning,
): number {
  const mag = Math.min(1, Math.max(0, input.mag))
  if (input.dirYaw !== null && mag > 0) {
    const d = wrapAngle(input.dirYaw - m.heading)
    const maxTurn = cfg.turnRateRadPerS * dt
    m.heading = wrapAngle(m.heading + THREE.MathUtils.clamp(d, -maxTurn, maxTurn))
    const target = cfg.maxSpeedMps * mag
    m.speed =
      m.speed < target
        ? Math.min(target, m.speed + cfg.accelMps2 * dt)
        : Math.max(target, m.speed - cfg.decelMps2 * dt)
  } else {
    m.speed = Math.max(0, m.speed - cfg.decelMps2 * dt)
  }
  return (m.speed * dt) / PLANET_RADIUS
}
