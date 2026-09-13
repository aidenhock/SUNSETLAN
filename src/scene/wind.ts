import * as THREE from 'three'

/**
 * The ONE global wind (Wind: the palms sway). Previously `WIND_AXIS` lived
 * in Clouds.tsx; it moves here so the clouds' drift, the fire's ember
 * drift, and the palms' crown sway all read the same wind. Pure and
 * unit-testable — no React, no scene state.
 */

/** Fixed planet-local wind axis — oblique so paths cross the island. */
export const WIND_AXIS = new THREE.Vector3(0.35, 0.8, 0.49).normalize()

/** Palm crown lean tuning, in radians. Kept subtle by design — a palm
 * must never look like it is being blown over. */
export const WIND = {
  axis: WIND_AXIS,
  baseRad: 0.045,
  gustRad: 0.035,
  breatheHz: 0.18,
  flutterHz: 1.1,
} as const

const _fallbackA = new THREE.Vector3(1, 0, 0)
const _fallbackB = new THREE.Vector3(0, 1, 0)

/**
 * The tangent wind direction at a planet-local unit position — the same
 * great-circle drift direction the clouds use: `normalize(cross(WIND_AXIS,
 * unit))`. Degenerate case (unit parallel to the axis) falls back to any
 * tangent so the result is always a valid unit vector.
 */
export function windDirAt(unit: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  out.crossVectors(WIND_AXIS, unit)
  if (out.lengthSq() < 1e-10) {
    out.crossVectors(WIND_AXIS, _fallbackA)
    if (out.lengthSq() < 1e-10) out.crossVectors(WIND_AXIS, _fallbackB)
  }
  return out.normalize()
}

/**
 * The crown lean angle (radians) at time `t` for a palm with phase
 * `phase` — a slow breathing lean with a small faster flutter riding on
 * top, so no two palms move in unison. Pure, deterministic.
 */
export function windLean(t: number, phase: number): number {
  const breathe = 0.5 + 0.5 * Math.sin(2 * Math.PI * WIND.breatheHz * t + phase)
  const flutter =
    Math.sin(2 * Math.PI * WIND.flutterHz * t + phase * 1.7) +
    0.6 * Math.sin(2 * Math.PI * WIND.flutterHz * 0.37 * t + phase * 2.3)
  return WIND.baseRad * breathe + WIND.gustRad * 0.5 * flutter * 0.5
}
