import * as THREE from 'three'

/**
 * Pure math for the Mario-Galaxy planet illusion. The avatar never moves:
 * it stands at the world pole (0, R, 0) and every "step" rotates the planet
 * group's quaternion underneath it. Everything here is unit-testable and
 * free of React/scene state.
 */

export const WORLD_UP = new THREE.Vector3(0, 1, 0)

/**
 * Quaternion for one movement step of `angle` radians toward `moveDir`
 * (a unit vector in the world XZ plane).
 *
 * Axis: cross(worldUp, moveDir) — horizontal, perpendicular to travel.
 * Sign: NEGATIVE angle. Rotating the planet by +angle around that axis
 * would carry the ground at the pole toward `moveDir`; the illusion needs
 * the ground to flow the opposite way (backward under the avatar's feet),
 * so the planet rotates against the input direction.
 */
export function rotationStep(moveDir: THREE.Vector3, angle: number): THREE.Quaternion {
  const axis = new THREE.Vector3().crossVectors(WORLD_UP, moveDir)
  if (axis.lengthSq() < 1e-12) return new THREE.Quaternion() // no horizontal input
  return new THREE.Quaternion().setFromAxisAngle(axis.normalize(), -angle)
}

/** Compose one step onto the current planet orientation (world-space rotation). */
export function applyStep(current: THREE.Quaternion, step: THREE.Quaternion): THREE.Quaternion {
  // p_world = q · p_local, so an extra world rotation premultiplies: q' = step · q.
  return new THREE.Quaternion().multiplyQuaternions(step, current).normalize()
}

/**
 * The planet-local direction currently under the avatar's feet, i.e. the
 * world pole pulled back through the planet's rotation.
 */
export function poleInPlanetSpace(q: THREE.Quaternion): THREE.Vector3 {
  return WORLD_UP.clone().applyQuaternion(q.clone().invert())
}

/**
 * Angular distance (radians) between the avatar's ground-contact point and a
 * planet-local direction. Multiply by the planet radius for meters of arc.
 */
export function angularDistanceToPole(q: THREE.Quaternion, localDir: THREE.Vector3): number {
  return poleInPlanetSpace(q).angleTo(localDir)
}

/**
 * Polar angle (radians) of the ground-contact point from the island's axis
 * (planet-local +Y). 0 = island center is underfoot; grows as you walk out.
 */
export function polarAngle(q: THREE.Quaternion): number {
  const y = THREE.MathUtils.clamp(poleInPlanetSpace(q).y, -1, 1)
  return Math.acos(y)
}

/**
 * Lat/long placement helper so laying out the island is sane.
 * lat 90° = island center (the pole at identity rotation); long 0° = +Z,
 * long 90° = +X. Returns a planet-local unit direction.
 */
export function latLongToUnit(latDeg: number, longDeg: number): THREE.Vector3 {
  const polar = THREE.MathUtils.degToRad(90 - latDeg)
  const long = THREE.MathUtils.degToRad(longDeg)
  return new THREE.Vector3(
    Math.sin(polar) * Math.sin(long),
    Math.cos(polar),
    Math.sin(polar) * Math.cos(long),
  )
}

/** Planet-local position tuple for content files. */
export function latLongToPosition(
  latDeg: number,
  longDeg: number,
  radius: number,
  altitude = 0,
): [number, number, number] {
  const u = latLongToUnit(latDeg, longDeg).multiplyScalar(radius + altitude)
  return [u.x, u.y, u.z]
}

/** Orients local +Y along the surface normal at `unit` (props stand upright). */
export function surfaceQuaternion(unit: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(WORLD_UP, unit.clone().normalize())
}

/**
 * Camera-relative move direction in the world XZ plane from raw input.
 * `ix` = right(+)/left(-), `iz` = forward(+)/back(-); `azimuth` is the
 * camera's yaw around the avatar (0 = camera on +Z looking toward -Z).
 */
export function cameraRelativeMoveDir(
  ix: number,
  iz: number,
  azimuth: number,
): THREE.Vector3 {
  const forward = new THREE.Vector3(-Math.sin(azimuth), 0, -Math.cos(azimuth))
  const right = new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth))
  const dir = forward.multiplyScalar(iz).add(right.multiplyScalar(ix))
  return dir.lengthSq() < 1e-12 ? dir.set(0, 0, 0) : dir.normalize()
}
