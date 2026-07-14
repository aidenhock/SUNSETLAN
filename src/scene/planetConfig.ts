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

/** Blockout scatter — also the source of the blocker list. */
export const scatterProps: ScatterProp[] = [
  { lat: 72, long: 150, kind: 'palm', scale: 1 },
  { lat: 68, long: 205, kind: 'palm', scale: 1.2 },
  { lat: 55, long: 170, kind: 'palm', scale: 0.9 },
  { lat: 48, long: 320, kind: 'palm', scale: 1.1 },
  { lat: 62, long: 40, kind: 'rock', scale: 1 },
  { lat: 40, long: 220, kind: 'rock', scale: 1.4 },
  { lat: 33, long: 120, kind: 'rock', scale: 1 },
  { lat: 58, long: 275, kind: 'palm', scale: 1 },
]

export const blockers: Blocker[] = scatterProps.map((p) => ({
  unit: latLongToUnit(p.lat, p.long),
  radius: p.kind === 'palm' ? 1.0 : 1.4,
}))
