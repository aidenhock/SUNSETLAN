import * as THREE from 'three'
import { latLongToUnit } from '../controls/planetMath'

/**
 * Planet sizing and island layout. Size and speed are the two knobs CLAUDE.md
 * says to tune: running across the island should take ~45–60 s with clearly
 * visible horizon curvature.
 */
export const PLANET_RADIUS = 70
/** Beach line: the island cap covers ~37% of the sphere (polar angle 75°). */
export const ISLAND_POLAR_DEG = 75
/** Inner grass cap for visual variety in the blockout. */
export const GRASS_POLAR_DEG = 52
/** Rotation clamp: the pole may wade ~2.5 m of arc past the beach line. */
export const MAX_POLAR_RAD = THREE.MathUtils.degToRad(ISLAND_POLAR_DEG) + 2.5 / PLANET_RADIUS

/** Island crossing = 2·75° of arc ≈ 183 m → ~46 s at 4 m/s. */
export const MOVE_SPEED = 4
export const INTERACT_ARC_M = 2.5
/** Hysteresis: once nearby, stay nearby until past this radius (no flicker). */
export const INTERACT_EXIT_ARC_M = 3.0

/** Cap heights above sea level — shared by Island.tsx geometry and the
 * controller's analytic ground height so they can never drift apart. */
export const SAND_ALTITUDE = 0.35
export const GRASS_ALTITUDE = 0.55

/** Walkable dock deck: a strip along its meridian; top = altitude + half thickness. */
export const DOCK = { longDeg: 90, latMinDeg: 14, latMaxDeg: 23, halfWidthM: 1, topAltitude: 0.69 }

export interface Blocker {
  /** Planet-local unit direction of the obstacle. */
  unit: THREE.Vector3
  /** Blocking radius in meters of arc. */
  radius: number
}

export interface ScatterProp {
  lat: number
  long: number
  kind: 'palm' | 'rock'
  scale: number
}

/** Decorative scatter — also feeds the blocker list. */
export const scatterProps: ScatterProp[] = [
  { lat: 72, long: 150, kind: 'palm', scale: 1 },
  { lat: 68, long: 205, kind: 'palm', scale: 1.2 },
  { lat: 55, long: 170, kind: 'palm', scale: 0.9 },
  { lat: 48, long: 320, kind: 'palm', scale: 1.1 },
  { lat: 42, long: 65, kind: 'palm', scale: 1 },
  { lat: 58, long: 275, kind: 'palm', scale: 1 },
  { lat: 62, long: 40, kind: 'rock', scale: 1 },
  { lat: 40, long: 220, kind: 'rock', scale: 1.4 },
  { lat: 33, long: 120, kind: 'rock', scale: 1 },
  { lat: 30, long: 145, kind: 'rock', scale: 1.2 },
]

/** Landmark obstacles (world-design props that should not be walked through). */
const landmarkBlockers: { lat: number; long: number; radius: number }[] = [
  { lat: 84, long: 186, radius: 1.0 }, // campfire (kept off the spawn-forward path)
  { lat: 83.5, long: 191, radius: 0.9 }, // log bench
  { lat: 55, long: 302.5, radius: 1.6 }, // big tree trunk
  { lat: 45, long: 358, radius: 1.2 }, // palapa desk
  { lat: 35, long: 135.8, radius: 0.9 }, // TV crate
  { lat: 24, long: 91, radius: 0.5 }, // mailbox post
  { lat: 20, long: 200, radius: 1.6 }, // beached rowboat
]

export const blockers: Blocker[] = [
  ...scatterProps.map((p) => ({
    unit: latLongToUnit(p.lat, p.long),
    radius: p.kind === 'palm' ? 1.0 : 1.4 * p.scale,
  })),
  ...landmarkBlockers.map((b) => ({
    unit: latLongToUnit(b.lat, b.long),
    radius: b.radius,
  })),
]
