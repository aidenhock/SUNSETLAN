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

/**
 * The groove (Palms groove). The wind above is weather; this is MUSIC — a
 * slow hip-hop head-nod the whole tree rides on. One lean left-and-right
 * every two beats, a squash-and-stretch bounce on every beat, and a crown
 * that whips a fraction behind the trunk.
 *
 * Amplitudes are deliberately tiny: summed with the wind the trunk's total
 * lean stays under ~0.13 rad (~7.5°), so a palm reads as dancing, never as
 * blown over.
 */
export const GROOVE = {
  /** Tempo of the island. */
  bpm: 92,
  /** Trunk lean amplitude (radians), left-right across the wind. */
  leanRad: 0.07,
  /** Extra crown lean amplitude (radians) about the crown pivot. */
  crownRad: 0.09,
  /** Crown phase lag behind the trunk (radians) — the whip. */
  crownLag: 0.6,
  /** Peak vertical stretch on the beat (scale = 1 + bounce). */
  bounce: 0.045,
  /** Peak x/z counter-squash at full stretch (fraction). */
  squash: 0.015,
  /** Per-palm tempo jitter (fraction of bpm) so the grove drifts in and
   * out of sync rather than marching. */
  bpmJitter: 0.04,
} as const

/** Angular frequency (rad/s) of the half-time nod: one lean per two beats. */
function leanOmega(bpm: number): number {
  return (2 * Math.PI * (bpm / 60)) / 2
}

/** Angular frequency (rad/s) of the beat itself. */
function beatOmega(bpm: number): number {
  return 2 * Math.PI * (bpm / 60)
}

/**
 * The trunk's groove lean (radians) at time `t` — a pure sine on the
 * half-time nod, bounded by `GROOVE.leanRad`.
 */
export function grooveLean(t: number, phase: number, bpm: number = GROOVE.bpm): number {
  return GROOVE.leanRad * Math.sin(leanOmega(bpm) * t + phase)
}

/**
 * The crown's extra groove lean (radians) — the same nod, `GROOVE.crownLag`
 * radians behind the trunk, so the fronds whip after the trunk has moved.
 */
export function grooveCrownLean(t: number, phase: number, bpm: number = GROOVE.bpm): number {
  return GROOVE.crownRad * Math.sin(leanOmega(bpm) * t + phase + GROOVE.crownLag)
}

/**
 * The vertical bounce scale at time `t`: `1 + bounce · max(0, sin(beat))²`.
 * Always ≥ 1 (a palm never sinks into the ground) and ≤ 1 + bounce; the
 * squared half-wave gives a pop ON the beat with rest between, rather than
 * a smooth wobble.
 */
export function grooveBounce(t: number, phase: number, bpm: number = GROOVE.bpm): number {
  const half = Math.max(0, Math.sin(beatOmega(bpm) * t + phase))
  return 1 + GROOVE.bounce * half * half
}

/**
 * The x/z counter-squash that goes with a bounce scale `s` — thinner as the
 * tree stretches, the cartoon volume cue. 1 at rest, 1 − `GROOVE.squash` at
 * full stretch.
 */
export function grooveSquash(s: number): number {
  return 1 - (GROOVE.squash * (s - 1)) / GROOVE.bounce
}

/**
 * The tempo of one palm — the island's BPM with a deterministic ±
 * `GROOVE.bpmJitter` wobble by instance index, so neighbouring palms drift
 * in and out of phase instead of locking into a chorus line.
 */
export function grooveBpm(index: number): number {
  const h = Math.sin((index + 1) * 12.9898) * 43758.5453
  const frac = h - Math.floor(h) // [0, 1)
  return GROOVE.bpm * (1 + GROOVE.bpmJitter * (frac * 2 - 1))
}
