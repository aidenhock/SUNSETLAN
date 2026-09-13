import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { WIND, windDirAt, windLean } from './wind'
import { IDENTITY_Q, surfacePartMatrix, swayMatrix } from './instancing'
import { buildPalm } from './props'

/**
 * Wind: the palms sway — pure-math coverage for wind.ts and the
 * swayMatrix builder in instancing.tsx. See docs/build-log.md for the
 * feature writeup.
 */

describe('windDirAt', () => {
  const samples = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0.3, 0.8, 0.5).normalize(),
    new THREE.Vector3(-0.6, 0.2, 0.9).normalize(),
  ]

  it('is unit length and perpendicular to the position', () => {
    const out = new THREE.Vector3()
    for (const unit of samples) {
      windDirAt(unit, out)
      expect(out.length()).toBeCloseTo(1, 6)
      expect(out.dot(unit)).toBeCloseTo(0, 6)
    }
  })

  it('falls back to a valid tangent when unit is parallel to the wind axis', () => {
    const out = new THREE.Vector3()
    windDirAt(WIND.axis.clone(), out)
    expect(out.length()).toBeCloseTo(1, 6)
    expect(Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z)).toBe(true)

    windDirAt(WIND.axis.clone().negate(), out)
    expect(out.length()).toBeCloseTo(1, 6)
  })
})

describe('windLean', () => {
  it('stays within the tuned envelope — mostly downwind, never wild', () => {
    // Analytic bound: the base term ranges [0, baseRad]; the gust term is
    // gustRad * 0.25 * (sinB + 0.6·sinC), which ranges within
    // [-0.4, 0.4] * gustRad. So the true range is [-0.4·gustRad,
    // baseRad + 0.4·gustRad] — comfortably inside [-gustRad, baseRad + gustRad].
    const upper = WIND.baseRad + WIND.gustRad
    const lower = -WIND.gustRad
    for (let i = 0; i < 300; i++) {
      const t = i * 0.37
      const phase = i * 2.399
      const lean = windLean(t, phase)
      expect(lean).toBeGreaterThanOrEqual(lower)
      expect(lean).toBeLessThanOrEqual(upper)
    }
  })

  it('gives different phases visibly different leans at the same instant', () => {
    const a = windLean(5, 0)
    const b = windLean(5, 2.399)
    expect(Math.abs(a - b)).toBeGreaterThan(0.001)
  })
})

describe('swayMatrix', () => {
  // A real palm placement (surfacePartMatrix — the same builder every
  // placed prop uses) and a real crown pivot from buildPalm itself.
  const placementM = surfacePartMatrix(30, 25, 0, 0, new THREE.Vector3(0, 0, 0), IDENTITY_Q, 1)
  const parts = buildPalm()
  const crownPart = parts.find((p) => p.sway)
  if (!crownPart?.sway) throw new Error('buildPalm did not tag a crown part with sway')
  const pivot = crownPart.sway.pivot

  it('leaves the pivot point fixed', () => {
    const M = swayMatrix(placementM, pivot, new THREE.Vector3(1, 0, 0), 0.3)
    const world = pivot.clone().applyMatrix4(M)
    const expected = pivot.clone().applyMatrix4(placementM)
    expect(world.distanceTo(expected)).toBeLessThan(1e-6)
  })

  it('leans the crown tip downwind', () => {
    const unit = new THREE.Vector3().setFromMatrixPosition(placementM).normalize()
    const worldWind = new THREE.Vector3()
    windDirAt(unit, worldWind)

    // The same local-axis derivation SwayInstances performs at mount.
    const dPos = new THREE.Vector3()
    const dQuat = new THREE.Quaternion()
    const dScale = new THREE.Vector3()
    placementM.decompose(dPos, dQuat, dScale)
    const localWind = worldWind.clone().applyQuaternion(dQuat.clone().invert())
    const axis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), localWind).normalize()

    const angle = 0.05 // a representative small positive lean
    const M = swayMatrix(placementM, pivot, axis, angle)
    const tipLocal = pivot.clone().add(new THREE.Vector3(0, 1, 0))
    const tipWorld = tipLocal.clone().applyMatrix4(M)
    const pivotWorld = pivot.clone().applyMatrix4(placementM)
    const displacement = tipWorld.clone().sub(pivotWorld)

    expect(displacement.dot(worldWind)).toBeGreaterThan(0)
  })

  it('never leans hard enough to look blown over', () => {
    // A sanity ceiling on the angle itself, independent of windLean's
    // envelope test above — the design goal in one assertion.
    expect(WIND.baseRad + WIND.gustRad).toBeLessThan(0.15) // < ~8.6°
  })
})
