import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  angularDistanceToPole,
  applyStep,
  cameraRelativeMoveDir,
  latLongToUnit,
  polarAngle,
  poleInPlanetSpace,
  projectSeatOffset,
  rotationStep,
  surfaceQuaternion,
  WORLD_UP,
} from './planetMath'

const FWD = new THREE.Vector3(0, 0, -1) // "walk forward" at default camera

describe('rotationStep', () => {
  it('rotates around cross(up, moveDir)', () => {
    const q = rotationStep(FWD, 0.1)
    const axis = new THREE.Vector3().crossVectors(WORLD_UP, FWD).normalize()
    // Extract the axis back out of the quaternion (sin is negative: negative angle).
    const s = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z)
    const extracted = new THREE.Vector3(q.x / s, q.y / s, q.z / s)
    expect(Math.abs(extracted.dot(axis))).toBeCloseTo(1, 6)
  })

  it('moves the ground opposite to travel: walking forward sends the old pole point backward', () => {
    const step = rotationStep(FWD, 0.2)
    // The planet-local point that started under the avatar…
    const groundPoint = WORLD_UP.clone()
    // …after the step, in world space:
    const after = groundPoint.applyQuaternion(step)
    // Walking toward -Z must push the ground toward +Z (behind the avatar).
    expect(after.z).toBeGreaterThan(0.01)
    expect(after.x).toBeCloseTo(0, 6)
  })

  it('returns identity for zero input', () => {
    const q = rotationStep(new THREE.Vector3(0, 0, 0), 0.2)
    expect(q.w).toBe(1)
  })
})

describe('polarAngle / clamping input', () => {
  it('walking forward by θ puts the contact point at polar angle θ', () => {
    let q = new THREE.Quaternion()
    const steps = 50
    for (let i = 0; i < steps; i++) q = applyStep(q, rotationStep(FWD, 0.3 / steps))
    expect(polarAngle(q)).toBeCloseTo(0.3, 5)
  })

  it('is 0 at identity (island center underfoot at spawn)', () => {
    expect(polarAngle(new THREE.Quaternion())).toBeCloseTo(0, 10)
  })

  it('walking out and back returns to the start', () => {
    let q = new THREE.Quaternion()
    q = applyStep(q, rotationStep(FWD, 0.25))
    q = applyStep(q, rotationStep(new THREE.Vector3(0, 0, 1), 0.25))
    expect(polarAngle(q)).toBeCloseTo(0, 5)
  })
})

describe('angularDistanceToPole (triggers)', () => {
  it('object at the pole reads 0 at identity', () => {
    expect(angularDistanceToPole(new THREE.Quaternion(), WORLD_UP)).toBeCloseTo(0, 10)
  })

  it('object at lat 80 reads 10 degrees at identity', () => {
    const obj = latLongToUnit(80, 180)
    const d = angularDistanceToPole(new THREE.Quaternion(), obj)
    expect(THREE.MathUtils.radToDeg(d)).toBeCloseTo(10, 4)
  })

  it('walking toward an object closes the distance', () => {
    const obj = latLongToUnit(80, 180) // 10° away, toward -Z at default camera
    const before = angularDistanceToPole(new THREE.Quaternion(), obj)
    const q = applyStep(new THREE.Quaternion(), rotationStep(FWD, 0.05))
    const after = angularDistanceToPole(q, obj)
    expect(after).toBeLessThan(before)
    expect(before - after).toBeCloseTo(0.05, 4)
  })
})

describe('latLongToUnit', () => {
  it('lat 90 is the island center (+Y)', () => {
    const u = latLongToUnit(90, 0)
    expect(u.distanceTo(WORLD_UP)).toBeLessThan(1e-9)
  })

  it('equator points sit in the XZ plane at the right longitudes', () => {
    expect(latLongToUnit(0, 0).distanceTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-9)
    expect(latLongToUnit(0, 90).distanceTo(new THREE.Vector3(1, 0, 0))).toBeLessThan(1e-9)
  })

  it('is always unit length', () => {
    expect(latLongToUnit(37, 123).length()).toBeCloseTo(1, 10)
  })
})

describe('surfaceQuaternion', () => {
  it('carries local +Y onto the surface normal', () => {
    const unit = latLongToUnit(45, 60)
    const q = surfaceQuaternion(unit)
    expect(WORLD_UP.clone().applyQuaternion(q).distanceTo(unit)).toBeLessThan(1e-9)
  })
})

describe('cameraRelativeMoveDir', () => {
  it('W at default camera walks toward -Z', () => {
    expect(cameraRelativeMoveDir(0, 1, 0).distanceTo(FWD)).toBeLessThan(1e-9)
  })

  it('D at default camera walks toward +X', () => {
    expect(
      cameraRelativeMoveDir(1, 0, 0).distanceTo(new THREE.Vector3(1, 0, 0)),
    ).toBeLessThan(1e-9)
  })

  it('camera rotated 90° remaps forward accordingly', () => {
    // azimuth π/2: camera sits on +X, so forward is -X.
    expect(
      cameraRelativeMoveDir(0, 1, Math.PI / 2).distanceTo(new THREE.Vector3(-1, 0, 0)),
    ).toBeLessThan(1e-9)
  })

  it('diagonals are normalized', () => {
    expect(cameraRelativeMoveDir(1, 1, 0).length()).toBeCloseTo(1, 10)
  })
})

describe('projectSeatOffset (free-position sitting — aim onto the centerline)', () => {
  // A log 3 m ahead of the avatar (camera azimuth 0 aims toward −Z),
  // its axis running along X.
  const center: readonly [number, number] = [0, -3]
  const axis: readonly [number, number] = [1, 0]

  it('aiming straight at the log center sits at its middle', () => {
    expect(projectSeatOffset(center, axis, 0, 0.7)).toBeCloseTo(0, 10)
  })

  it('a small aim swing projects CONTINUOUSLY along the wood', () => {
    // Positive azimuth swings the camera toward +X, so the aim point
    // moves toward −X — the projection follows it exactly, no slots.
    expect(projectSeatOffset(center, axis, 0.15, 0.7)).toBeCloseTo(-3 * Math.sin(0.15), 10)
    expect(projectSeatOffset(center, axis, -0.1, 0.7)).toBeCloseTo(3 * Math.sin(0.1), 10)
  })

  it('aiming past an end clamps to the usable span (0.3 m end margins)', () => {
    expect(projectSeatOffset(center, axis, 0.5, 0.7)).toBe(-0.7)
    expect(projectSeatOffset(center, axis, -0.5, 0.7)).toBe(0.7)
  })

  it('returns the true perpendicular foot on a diagonal log', () => {
    const dCenter: readonly [number, number] = [0.4, -2.6]
    const inv = Math.SQRT1_2
    const dAxis: readonly [number, number] = [inv, -inv]
    const s = projectSeatOffset(dCenter, dAxis, 0.2, 0.7)
    // Minimal-distance property: nudging the seat either way along the
    // axis only moves it AWAY from the aim point.
    const aim: readonly [number, number] = [-Math.sin(0.2) * 3, -Math.cos(0.2) * 3]
    const distAt = (t: number) =>
      Math.hypot(dCenter[0] + dAxis[0] * t - aim[0], dCenter[1] + dAxis[1] * t - aim[1])
    expect(distAt(s)).toBeLessThanOrEqual(distAt(s + 0.05) + 1e-12)
    expect(distAt(s)).toBeLessThanOrEqual(distAt(s - 0.05) + 1e-12)
  })
})

describe('poleInPlanetSpace round trip', () => {
  it('rotating the found local point by q lands back on the world pole', () => {
    let q = new THREE.Quaternion()
    q = applyStep(q, rotationStep(new THREE.Vector3(1, 0, 0).normalize(), 0.4))
    q = applyStep(q, rotationStep(FWD, 0.2))
    const local = poleInPlanetSpace(q)
    expect(local.clone().applyQuaternion(q).distanceTo(WORLD_UP)).toBeLessThan(1e-9)
  })
})
