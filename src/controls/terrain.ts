import * as THREE from 'three'
import { DOCK, PLANET_RADIUS, SOUTH_DOCK, terrainProfile } from '../scene/planetConfig'

/**
 * Analytic terrain (v3.2). The walkable world is ONE continuous profile —
 * terrainProfile(polar) in planetConfig, the same function the terrain mesh
 * is shaped from (placement rule 4) — plus the dock strip. Ground height is
 * a pure function of (lat, long): no raycasting, and placement code derives
 * altitudes from the exact surface the controller walks on. Wading depth is
 * the real slope past the waterline; there is no step.
 */

/** Continuous profile altitude above sea level at a latitude. */
function bandAltitudeAt(latDeg: number): number {
  return terrainProfile(THREE.MathUtils.degToRad(90 - latDeg))
}

/** The walkable strips: the island's dock and Antarctica's. Both are
 *  the same shape — a lat span along one meridian, half a width wide. */
export type DockStrip = typeof DOCK

/** True when (lat, long) is on ONE dock's walkable strip. */
function onStrip(dock: DockStrip, latDeg: number, longDeg: number): boolean {
  if (latDeg < dock.latMinDeg || latDeg > dock.latMaxDeg) return false
  const polar = THREE.MathUtils.degToRad(90 - latDeg)
  const dLong = ((longDeg - dock.longDeg + 540) % 360) - 180
  const crossTrackM =
    Math.abs(THREE.MathUtils.degToRad(dLong)) * Math.sin(polar) * PLANET_RADIUS
  return crossTrackM <= dock.halfWidthM
}

/** True when (lat, long) is on EITHER dock's walkable strip. */
export function onDockStrip(latDeg: number, longDeg: number): boolean {
  return onStrip(DOCK, latDeg, longDeg) || onStrip(SOUTH_DOCK, latDeg, longDeg)
}

/** The dock whose strip (lat, long) sits on, or null. */
export function dockStripAt(latDeg: number, longDeg: number): DockStrip | null {
  if (onStrip(DOCK, latDeg, longDeg)) return DOCK
  if (onStrip(SOUTH_DOCK, latDeg, longDeg)) return SOUTH_DOCK
  return null
}

/**
 * Ground altitude above sea level at (lat, long). The dock deck rides
 * deckHeightM above its local band (surface-snapped segments), so the same
 * function drives the deck visuals and the walkable height.
 */
export function groundAltitudeAt(latDeg: number, longDeg: number): number {
  const band = bandAltitudeAt(latDeg)
  const dock = dockStripAt(latDeg, longDeg)
  if (dock) return band + dock.deckHeightM
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
