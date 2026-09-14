import * as THREE from 'three'
import { MOORING_LATLONG, mooredBoatDock } from '../scene/boat'
import {
  BOAT,
  BOAT_DECK_M,
  DOCK,
  PLANET_RADIUS,
  SOUTH_DOCK,
  terrainProfile,
} from '../scene/planetConfig'

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

/** Metres of arc per degree of latitude — the scaling the dock strip
 *  and the blockers both measure in. */
const M_PER_DEG_LAT = (PLANET_RADIUS * Math.PI) / 180

/**
 * True when (lat, long) lies on the MOORED boat's deck — a
 * hullLengthM x hullWidthM rectangle centred on the current mooring,
 * its long axis along the mooring's meridian (the moored bow points
 * down the meridian away from land, which is the yaw BoatScene uses, so
 * the footprint is meridian-aligned and needs no rotation).
 *
 * Pure arithmetic in the local tangent frame, the same mPerDegLat /
 * cos(lat) scaling onStrip uses — and NO allocation, because
 * groundHeightAt calls this every frame. False while the boat is being
 * boarded, driven or tied up: the hull is at the pole then, not here.
 */
export function onBoatDeck(latDeg: number, longDeg: number): boolean {
  const dock = mooredBoatDock()
  if (dock === null) return false
  const m = MOORING_LATLONG[dock]
  const alongM = (latDeg - m.lat) * M_PER_DEG_LAT
  if (Math.abs(alongM) > BOAT.hullLengthM / 2) return false
  const dLong = ((longDeg - m.long + 540) % 360) - 180
  const crossM = dLong * M_PER_DEG_LAT * Math.cos(THREE.MathUtils.degToRad(latDeg))
  return Math.abs(crossM) <= BOAT.hullWidthM / 2
}

/**
 * Ground altitude above sea level at (lat, long). The dock deck rides
 * deckHeightM above its local band (surface-snapped segments), so the same
 * function drives the deck visuals and the walkable height.
 *
 * The moored boat is a walkable surface on the same terms: its floor is
 * BOAT_DECK_M above the SEA, not above the sea bed, so the band is
 * floored at zero — walk off the dock end and you step DOWN onto the
 * hull, wade out to it and you step UP out of the water, and either way
 * you never glitch into the boat.
 */
export function groundAltitudeAt(latDeg: number, longDeg: number): number {
  const band = bandAltitudeAt(latDeg)
  if (onBoatDeck(latDeg, longDeg)) return Math.max(band, 0) + BOAT_DECK_M
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
