import * as THREE from 'three'
import {
  DOCK,
  GRASS_ALTITUDE,
  GRASS_POLAR_DEG,
  ISLAND_POLAR_DEG,
  PLANET_RADIUS,
  SAND_ALTITUDE,
} from '../scene/planetConfig'

/**
 * Analytic terrain. The walkable world is concentric sphere caps plus the
 * dock strip, so ground height is a pure function of (lat, long) — no
 * raycasting, and placement code derives altitudes from the same bands the
 * controller walks on (placement rule 1: never hardcode altitude).
 */

const GRASS_THETA = THREE.MathUtils.degToRad(GRASS_POLAR_DEG)
const ISLAND_THETA = THREE.MathUtils.degToRad(ISLAND_POLAR_DEG)

/** Base band (grass / sand / water) altitude above sea level at a latitude. */
function bandAltitudeAt(latDeg: number): number {
  const polar = THREE.MathUtils.degToRad(90 - latDeg)
  if (polar < GRASS_THETA) return GRASS_ALTITUDE
  if (polar < ISLAND_THETA) return SAND_ALTITUDE
  return 0
}

/** True when (lat, long) is on the dock's walkable strip. */
export function onDockStrip(latDeg: number, longDeg: number): boolean {
  if (latDeg < DOCK.latMinDeg || latDeg > DOCK.latMaxDeg) return false
  const polar = THREE.MathUtils.degToRad(90 - latDeg)
  const dLong = ((longDeg - DOCK.longDeg + 540) % 360) - 180
  const crossTrackM =
    Math.abs(THREE.MathUtils.degToRad(dLong)) * Math.sin(polar) * PLANET_RADIUS
  return crossTrackM <= DOCK.halfWidthM
}

/**
 * Ground altitude above sea level at (lat, long). The dock deck rides
 * deckHeightM above its local band (surface-snapped segments), so the same
 * function drives the deck visuals and the walkable height.
 */
export function groundAltitudeAt(latDeg: number, longDeg: number): number {
  const band = bandAltitudeAt(latDeg)
  if (onDockStrip(latDeg, longDeg)) return band + DOCK.deckHeightM
  return band
}

/** World-space ground height under the avatar (avatar y-position).
 *  Called every frame — no object allocation (lat/long computed inline). */
export function groundHeightAt(poleLocal: THREE.Vector3): number {
  const polar = Math.acos(THREE.MathUtils.clamp(poleLocal.y, -1, 1))
  const lat = 90 - THREE.MathUtils.radToDeg(polar)
  const long = THREE.MathUtils.radToDeg(Math.atan2(poleLocal.x, poleLocal.z))
  return PLANET_RADIUS + groundAltitudeAt(lat, long)
}
