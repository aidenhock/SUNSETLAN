import * as THREE from 'three'
import { terrainProfile } from './planetConfig'

/**
 * Pure penguin random-walk kernel (Antarctica life) — the crab kernel's
 * southern cousin, extracted so vitest can drive long runs against the
 * band invariants: the polar angle FROM THE SOUTH POLE stays inside
 * [8°, 21.5°] (never up onto the bare pole, never off the shelf), and a
 * step never leaves a penguin standing on ground at or below the
 * waterline (`groundAltitude > 0.05` — they waddle, they do not swim).
 *
 * State is kept in (sp, long) rather than (lat, long): sp is degrees
 * from the SOUTH pole, which is how the whole south cap is measured
 * (`polarFromOwnPole`), so the band clamp reads the way it is written
 * down. `lat = sp − 90`.
 */

export interface PenguinState {
  /** Degrees from the SOUTH pole. */
  sp: number
  long: number
  /** Bearing: 0 = away from the pole (increasing sp), +π/2 = east. */
  heading: number
  state: 'pause' | 'walk' | 'hop'
  timer: number
  /** Waddle cycle phase (radians). */
  phase: number
}

/** The walkable band, in degrees from the south pole. */
export const PENGUIN_BAND = { spMin: 8, spMax: 21.5 }
export const PENGUIN_SPEED = { walk: 0.7, hop: 1.4 }
/** Startled penguins shuffle for this long before settling. */
export const PENGUIN_HOP_S = 1.2
/** Above this much ground the snow is dry enough to stand on. */
export const PENGUIN_DRY_ALT_M = 0.05

const PLANET_R = 55

/** Ground altitude at a penguin's spot — terrain only (no dock deck:
 *  a penguin on the planks would be standing on air either way). */
export function penguinGroundAlt(sp: number): number {
  return terrainProfile(Math.PI - THREE.MathUtils.degToRad(sp))
}

export const penguinLat = (sp: number): number => sp - 90

/** Turn the penguin around when a clamp bites — the same reflection the
 *  crabs use, so a cornered critter walks back out instead of grinding. */
function reflect(p: PenguinState) {
  p.heading = Math.PI - p.heading
}

/** Push back inside the band and up out of the water. Runs every step
 *  (walking, hopping AND paused): the clamp is about where a penguin is
 *  allowed to BE, not about what it happens to be doing. */
function clampToBand(p: PenguinState) {
  if (p.sp > PENGUIN_BAND.spMax) {
    p.sp = PENGUIN_BAND.spMax
    reflect(p)
  }
  if (p.sp < PENGUIN_BAND.spMin) {
    p.sp = PENGUIN_BAND.spMin
    reflect(p)
  }
  // The shelf ramps to zero at the waterline, so the outer end of the
  // band can be wet before the band itself runs out — walk uphill until
  // it is dry. Bounded: each step is 0.05° ≈ 5 cm toward the pole.
  let guard = 0
  while (penguinGroundAlt(p.sp) <= PENGUIN_DRY_ALT_M && guard++ < 400) {
    p.sp -= 0.05
    reflect(p)
  }
}

/** Startle: face directly away from `awayHeading` and hop-shuffle. */
export function startlePenguin(p: PenguinState, awayHeading: number) {
  p.state = 'hop'
  p.timer = PENGUIN_HOP_S
  p.heading = awayHeading
}

/**
 * One step of the waddle. Penguins pause often (2–6 s) and walk in
 * short bursts, turning in place when they set off again.
 */
export function advancePenguin(
  p: PenguinState,
  dt: number,
  rng: () => number = Math.random,
): void {
  p.timer -= dt
  // The waddle cycle runs with the gait: a paused penguin still sways.
  p.phase += dt * (p.state === 'pause' ? 1.6 : p.state === 'walk' ? 6.2 : 11)
  if (p.timer <= 0) {
    if (p.state === 'pause') {
      p.state = 'walk'
      p.timer = 1.4 + rng() * 2.6
      // Turn in place: a fresh bearing, not a nudge to the old one.
      p.heading = rng() * Math.PI * 2
    } else {
      p.state = 'pause'
      p.timer = 2 + rng() * 4
    }
  }

  if (p.state !== 'pause') {
    const speed = p.state === 'hop' ? PENGUIN_SPEED.hop : PENGUIN_SPEED.walk
    const degPerM = 180 / (Math.PI * PLANET_R)
    p.sp += Math.cos(p.heading) * speed * dt * degPerM
    // Longitude degrees shrink toward the pole; sp ≥ 8° keeps sin() well
    // clear of zero, so there is no singularity to guard.
    p.long +=
      (Math.sin(p.heading) * speed * dt * degPerM) /
      Math.max(0.1, Math.sin(THREE.MathUtils.degToRad(p.sp)))
    p.long = ((p.long % 360) + 360) % 360
  }
  clampToBand(p)
}
