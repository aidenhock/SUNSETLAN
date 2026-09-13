import { PLANET_RADIUS } from './planetConfig'

/**
 * Animal-Crossing-style NPC wander, as pure math (crabWalk.ts is the
 * pattern): the villager pauses, picks somewhere inside its home radius,
 * ambles over, pauses again. Everything that can be wrong here — leaving
 * the walkable ground, never arriving, drifting off the leash — is a
 * property vitest can drive for thousands of steps, so none of it lives
 * inside a useFrame where only eyeballs can check it.
 *
 * Distances are METRES OF ARC on the planet's surface, converted with
 * one constant: a degree of latitude is π·R/180 metres, and a degree of
 * longitude is that same figure shrunk by cos(lat) — the villagers stand
 * near a pole, where that shrink is most of the story.
 */

/** Metres of surface arc per degree of latitude on this planet. */
export const METRES_PER_DEG = (Math.PI * PLANET_RADIUS) / 180

const DEG = Math.PI / 180

/** Longitude metres per degree at a latitude (never divides by zero). */
function metresPerDegLong(latDeg: number): number {
  return METRES_PER_DEG * Math.max(0.02, Math.cos(latDeg * DEG))
}

export interface NpcState {
  lat: number
  long: number
  /** Facing, radians from local north, positive east. */
  heading: number
  state: 'pause' | 'walk'
  /** Seconds left in the current state. */
  timer: number
  target: { lat: number; long: number } | null
}

export interface NpcWanderOpts {
  radiusM: number
  speedMps: number
  pauseMin: number
  pauseMax: number
  rand: () => number
  walkable: (lat: number, long: number) => boolean
}

/** Shortest signed longitude difference in degrees, wrapped to ±180. */
function dLongDeg(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180
}

/**
 * Somewhere walkable within `radiusM` of home. Up to 12 tries — a
 * villager standing on a narrow ridge may need several — then home
 * itself, which is walkable by construction (it is where we put them).
 *
 * sqrt of the random radius spreads points EVENLY over the disc; a raw
 * random radius clusters them at the centre, and the villager looks
 * like it is orbiting a drain.
 */
export function pickWanderTarget(
  home: { lat: number; long: number },
  radiusM: number,
  rand: () => number,
  walkable: (lat: number, long: number) => boolean,
): { lat: number; long: number } {
  for (let i = 0; i < 12; i++) {
    const bearing = rand() * Math.PI * 2
    const r = Math.sqrt(rand()) * radiusM
    const lat = home.lat + (Math.cos(bearing) * r) / METRES_PER_DEG
    const long = home.long + (Math.sin(bearing) * r) / metresPerDegLong(lat)
    if (walkable(lat, long)) return { lat, long }
  }
  return { lat: home.lat, long: home.long }
}

/** Arrival tolerance in metres — walking closer than this reads as standing still. */
export const ARRIVE_M = 0.15

/**
 * One step of the wander. Mutates `s` (allocation-free but for the
 * target object, which is replaced only when a new one is picked).
 *
 * The walkable test gates the STEP, not just the target: a straight line
 * between two walkable points can still cross water on a curved coast,
 * and a villager paddling out to sea is the failure everyone notices.
 */
export function advanceNpc(
  s: NpcState,
  dt: number,
  home: { lat: number; long: number },
  opts: NpcWanderOpts,
): void {
  const pauseFor = () => opts.pauseMin + opts.rand() * (opts.pauseMax - opts.pauseMin)
  s.timer -= dt

  if (s.state === 'pause') {
    if (s.timer > 0) return
    s.target = pickWanderTarget(home, opts.radiusM, opts.rand, opts.walkable)
    s.state = 'walk'
    s.timer = 0
    return
  }

  const t = s.target
  if (!t) {
    s.state = 'pause'
    s.timer = pauseFor()
    return
  }

  const dNorth = (t.lat - s.lat) * METRES_PER_DEG
  const dEast = dLongDeg(s.long, t.long) * metresPerDegLong(s.lat)
  const dist = Math.hypot(dNorth, dEast)
  if (dist < ARRIVE_M) {
    s.state = 'pause'
    s.timer = pauseFor()
    s.target = null
    return
  }

  // Facing is the direction of travel, in the same north/east convention
  // placements use for yawDeg.
  s.heading = Math.atan2(dEast, dNorth)
  const step = Math.min(dist, opts.speedMps * dt)
  const lat = s.lat + ((dNorth / dist) * step) / METRES_PER_DEG
  const long = s.long + ((dEast / dist) * step) / metresPerDegLong(lat)
  if (opts.walkable(lat, long)) {
    s.lat = lat
    s.long = long
  } else {
    // Blocked: stop where it is safe and pick again after a beat.
    s.state = 'pause'
    s.timer = pauseFor()
    s.target = null
  }
}
