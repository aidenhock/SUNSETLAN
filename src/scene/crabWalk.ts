import * as THREE from 'three'
import { PLANET_RADIUS, surfOffset, terrainProfile } from './planetConfig'

/**
 * Pure crab random-walk kernel (3C) — extracted so vitest can drive
 * long runs against the band invariants: lat stays in [16, 23] (never
 * grass, never past the floor) and a step never leaves the crab below
 * the LIVE waterline (surfOffset).
 */

export interface CrabState {
  lat: number
  long: number
  heading: number
  state: 'pause' | 'walk' | 'skitter'
  timer: number
  phase: number
}

export const CRAB_BAND = { latMin: 16, latMax: 23 }
export const CRAB_SPEED = { walk: 0.55, skitter: 2.0 }

export function advanceCrab(crab: CrabState, dt: number, t: number, rng: () => number = Math.random) {
  crab.timer -= dt
  crab.phase += dt * (crab.state === 'pause' ? 2 : crab.state === 'walk' ? 10 : 20)
  if (crab.timer <= 0) {
    if (crab.state === 'pause') {
      crab.state = 'walk'
      crab.timer = 0.8 + rng() * 1.4
      crab.heading = rng() * Math.PI * 2
    } else {
      crab.state = 'pause'
      crab.timer = 0.8 + rng() * 2.2
    }
  }
  // The LIVE waterline clamp runs even while paused — the surf can
  // rise to a resting crab, and it must scoot uphill, not get wet.
  let polarNow = THREE.MathUtils.degToRad(90 - crab.lat)
  while (terrainProfile(polarNow) < surfOffset(polarNow, t) + 0.04) {
    crab.lat += 0.05
    crab.heading = Math.PI - crab.heading
    polarNow = THREE.MathUtils.degToRad(90 - crab.lat)
  }
  if (crab.state === 'pause') return
  const speed = crab.state === 'skitter' ? CRAB_SPEED.skitter : CRAB_SPEED.walk
  const degPerM = 180 / (Math.PI * PLANET_RADIUS)
  crab.lat += Math.cos(crab.heading) * speed * dt * degPerM
  crab.long += (Math.sin(crab.heading) * speed * dt * degPerM) / Math.cos((crab.lat * Math.PI) / 180)
  // Band clamps: grass edge above, hard floor + LIVE waterline below.
  if (crab.lat > CRAB_BAND.latMax) {
    crab.lat = CRAB_BAND.latMax
    crab.heading = Math.PI - crab.heading
  }
  if (crab.lat < CRAB_BAND.latMin) {
    crab.lat = CRAB_BAND.latMin
    crab.heading = Math.PI - crab.heading
  }
  let polar = THREE.MathUtils.degToRad(90 - crab.lat)
  while (terrainProfile(polar) < surfOffset(polar, t) + 0.04) {
    crab.lat += 0.05
    crab.heading = Math.PI - crab.heading
    polar = THREE.MathUtils.degToRad(90 - crab.lat)
  }
}
