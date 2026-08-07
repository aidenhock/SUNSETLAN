import * as THREE from 'three'
import { latLongToUnit } from '../controls/planetMath'
import { surfacePartMatrix } from './instancing'
import { MAP, PLANET_RADIUS } from './planetConfig'

/**
 * Seat definitions for the campfire log circle (3C sit system). Three
 * seats per log — slots at −0.6 / 0 / +0.6 m along the log's local x
 * axis. Seat directions are derived with surfacePartMatrix, the SAME
 * math the renderer uses to place the logs, so a seat can never drift
 * off its rendered log no matter how the yaw conventions evolve.
 */

const SEAT_SLOT_OFFSET_M = 0.6
/** Where you pop up when standing: just in front of the seat, fire side. */
const STAND_AHEAD_M = 0.55

export const FIRE_UNIT = latLongToUnit(MAP.campfire.lat, MAP.campfire.long)

/** Log centers, planet-local — the controller's sit-prompt proximity. */
export const LOG_UNITS: THREE.Vector3[] = MAP.logs.map((l) => latLongToUnit(l.lat, l.long))

/** Great-circle step from `unit` toward the fire by `meters` of arc. */
function towardFire(unit: THREE.Vector3, meters: number): THREE.Vector3 {
  const tangent = FIRE_UNIT.clone().addScaledVector(unit, -FIRE_UNIT.dot(unit)).normalize()
  const a = meters / PLANET_RADIUS
  return unit.clone().multiplyScalar(Math.cos(a)).addScaledVector(tangent, Math.sin(a)).normalize()
}

export interface SeatDef {
  id: string
  logIndex: number
  slot: -1 | 0 | 1
  /** Planet-local direction of the seat point on the log. */
  unit: THREE.Vector3
  /** Planet-local direction of the stand-up spot (fire side of the seat). */
  standUnit: THREE.Vector3
}

export const SEATS: SeatDef[] = MAP.logs.flatMap((l, logIndex) =>
  ([-1, 0, 1] as const).map((slot) => {
    const m = surfacePartMatrix(
      l.lat,
      l.long,
      0,
      l.yaw,
      new THREE.Vector3(slot * SEAT_SLOT_OFFSET_M, 0, 0),
      new THREE.Quaternion(),
      1,
    )
    const unit = new THREE.Vector3().setFromMatrixPosition(m).normalize()
    return { id: `${logIndex}:${slot + 1}`, logIndex, slot, unit, standUnit: towardFire(unit, STAND_AHEAD_M) }
  }),
)

export function seatById(id: string): SeatDef | undefined {
  return SEATS.find((s) => s.id === id)
}
