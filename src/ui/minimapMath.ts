import * as THREE from 'three'
import { poleInPlanetSpace } from '../controls/planetMath'

/**
 * Minimap projection: a bird's-eye view CENTRED ON THE CHARACTER, with
 * the camera's heading pointing up — the map turns as you turn, and you
 * are always the dot in the middle.
 *
 * Everything is derived from the live planet quaternion, so the map
 * tracks continuously rather than snapping when the player stops. There
 * is no exploration state: the island is drawn whole, always (the owner
 * ruled out fog-of-war).
 *
 * The projection is azimuthal around the player: a target's ANGULAR
 * distance becomes its radius in metres, and its bearing from local
 * north becomes its angle. Both come from the tangent frame at the
 * player's feet.
 */

export interface LocalFrame {
  /** Planet-local direction currently under the avatar. */
  pole: THREE.Vector3
  /** Tangent pointing to local north (toward the island's centre). */
  north: THREE.Vector3
  /** Tangent pointing east. */
  east: THREE.Vector3
}

const _u = new THREE.Vector3()
const _tangent = new THREE.Vector3()
const _fwd = new THREE.Vector3()

/** The tangent frame under the avatar, in planet-local coordinates. */
export function playerFrame(quat: THREE.Quaternion, out?: LocalFrame): LocalFrame {
  const frame = out ?? {
    pole: new THREE.Vector3(),
    north: new THREE.Vector3(),
    east: new THREE.Vector3(),
  }
  poleInPlanetSpace(quat, frame.pole)
  frame.pole.normalize()
  // North = the tangent toward lat 90. Degenerate exactly at the pole,
  // where any tangent is north; +Z keeps the map from flipping there.
  const lat = Math.asin(THREE.MathUtils.clamp(frame.pole.y, -1, 1))
  if (Math.abs(Math.cos(lat)) < 1e-6) {
    frame.north.set(0, 0, 1)
  } else {
    // d(pole)/d(lat) with longitude held: straight toward the pole.
    frame.north
      .set(-frame.pole.x * frame.pole.y, 1 - frame.pole.y * frame.pole.y, -frame.pole.z * frame.pole.y)
      .normalize()
  }
  frame.east.crossVectors(frame.north, frame.pole).normalize()
  return frame
}

/** Great-circle distance in metres from the player to a planet-local unit. */
export function rangeTo(frame: LocalFrame, unit: THREE.Vector3, radius: number): number {
  return Math.acos(THREE.MathUtils.clamp(frame.pole.dot(unit), -1, 1)) * radius
}

/**
 * Bearing in radians from local north (positive turning east) to a
 * planet-local unit — the direction you would walk to reach it.
 */
export function bearingTo(frame: LocalFrame, unit: THREE.Vector3): number {
  // Project the target onto the tangent plane at the player.
  _u.copy(unit).addScaledVector(frame.pole, -frame.pole.dot(unit))
  if (_u.lengthSq() < 1e-12) return 0
  _u.normalize()
  return Math.atan2(_u.dot(frame.east), _u.dot(frame.north))
}

/**
 * The camera's heading as a bearing from local north, so the map can be
 * rotated to put "where I am looking" at the top. `forwardWorld` is the
 * camera's forward direction in world space; `quat` the planet's.
 */
export function cameraHeading(
  frame: LocalFrame,
  forwardWorld: THREE.Vector3,
  quat: THREE.Quaternion,
): number {
  _fwd.copy(forwardWorld).applyQuaternion(_qi.copy(quat).invert())
  _tangent.copy(_fwd).addScaledVector(frame.pole, -frame.pole.dot(_fwd))
  if (_tangent.lengthSq() < 1e-12) return 0
  _tangent.normalize()
  return Math.atan2(_tangent.dot(frame.east), _tangent.dot(frame.north))
}
const _qi = new THREE.Quaternion()

/**
 * Canvas offset (pixels, y down) for something `range` metres away at
 * `bearing`, on a map whose up direction is `heading`.
 */
export function toScreen(
  range: number,
  bearing: number,
  heading: number,
  pxPerM: number,
  out: { x: number; y: number },
): { x: number; y: number } {
  const a = bearing - heading
  const r = range * pxPerM
  out.x = Math.sin(a) * r
  out.y = -Math.cos(a) * r
  return out
}

/**
 * The same mapping for the flat room: an offset in room metres becomes a
 * canvas offset, rotated so the camera's forward direction is up.
 * `forward` is the camera's world XZ forward (the room shares world axes).
 */
export function roomToScreen(
  dx: number,
  dz: number,
  forwardX: number,
  forwardZ: number,
  pxPerM: number,
  out: { x: number; y: number },
): { x: number; y: number } {
  const len = Math.hypot(forwardX, forwardZ) || 1
  const fx = forwardX / len
  const fz = forwardZ / len
  // right = forward × up = (-fz, fx); up on screen is forward.
  out.x = (dx * -fz + dz * fx) * pxPerM
  out.y = -(dx * fx + dz * fz) * pxPerM
  return out
}
