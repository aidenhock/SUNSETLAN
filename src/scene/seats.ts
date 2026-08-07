import * as THREE from 'three'
import { latLongToUnit } from '../controls/planetMath'
import { surfacePartMatrix } from './instancing'
import { MAP, PLANET_RADIUS } from './planetConfig'

/**
 * Seating geometry for the campfire log circle (3C sit system,
 * free-position since campfire polish 4). A seat is any point on a
 * log's centerline within the usable span — the sit target derives
 * from surfacePartMatrix, the SAME math the renderer places the logs
 * with, so a seat can never drift off the rendered wood.
 */

/** Logs are 2 m; leave ~0.3 m at each end. */
export const SEAT_HALF_SPAN_M = 0.7
/** Where you pop up when standing: just in front of the seat, fire side. */
const STAND_AHEAD_M = 0.55

export const FIRE_UNIT = latLongToUnit(MAP.campfire.lat, MAP.campfire.long)

/** Log centers, planet-local — the controller's sit-prompt proximity. */
export const LOG_UNITS: THREE.Vector3[] = MAP.logs.map((l) => latLongToUnit(l.lat, l.long))

/** Log axis directions (planet-local unit vectors along each log's +x),
 * extracted from the same placement matrix the renderer uses. */
export const LOG_AXES: THREE.Vector3[] = MAP.logs.map((l) => {
  const m = surfacePartMatrix(l.lat, l.long, 0, l.yaw, new THREE.Vector3(), new THREE.Quaternion(), 1)
  const axis = new THREE.Vector3()
  m.extractBasis(axis, new THREE.Vector3(), new THREE.Vector3())
  return axis.normalize()
})

/** Great-circle step from `unit` toward the fire by `meters` of arc. */
function towardFire(unit: THREE.Vector3, meters: number): THREE.Vector3 {
  const tangent = FIRE_UNIT.clone().addScaledVector(unit, -FIRE_UNIT.dot(unit)).normalize()
  const a = meters / PLANET_RADIUS
  return unit.clone().multiplyScalar(Math.cos(a)).addScaledVector(tangent, Math.sin(a)).normalize()
}

/** A free seat position on a log: { log index, signed offset (m) along
 * the log's axis from its center }. */
export interface SeatSpot {
  log: number
  offsetM: number
}

/** Planet-local direction of the seat point (event-time; allocates). */
export function seatUnit(spot: SeatSpot): THREE.Vector3 {
  const l = MAP.logs[spot.log]
  const m = surfacePartMatrix(
    l.lat,
    l.long,
    0,
    l.yaw,
    new THREE.Vector3(spot.offsetM, 0, 0),
    new THREE.Quaternion(),
    1,
  )
  return new THREE.Vector3().setFromMatrixPosition(m).normalize()
}

/** Planet-local direction of the stand-up spot (fire side of the seat). */
export function standUnit(spot: SeatSpot): THREE.Vector3 {
  return towardFire(seatUnit(spot), STAND_AHEAD_M)
}
