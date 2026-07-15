import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  DOCK,
  GRASS_ALTITUDE,
  PLANET_RADIUS,
  SAND_ALTITUDE,
} from '../scene/planetConfig'
import { latLongToUnit, meridianYaw, surfaceQuaternion } from './planetMath'
import { groundAltitudeAt, groundHeightAt, onDockStrip } from './terrain'

describe('groundAltitudeAt (analytic bands, v3 proportions)', () => {
  it('spawn (island center) stands on grass', () => {
    expect(groundAltitudeAt(90, 0)).toBeCloseTo(GRASS_ALTITUDE, 6)
  })

  it('grass now reaches down to lat 24', () => {
    expect(groundAltitudeAt(30, 200)).toBeCloseTo(GRASS_ALTITUDE, 6)
    expect(groundAltitudeAt(25, 100)).toBeCloseTo(GRASS_ALTITUDE, 6)
  })

  it('the sand ring is lat 15–24', () => {
    expect(groundAltitudeAt(23, 200)).toBeCloseTo(SAND_ALTITUDE, 6)
    expect(groundAltitudeAt(16, 40)).toBeCloseTo(SAND_ALTITUDE, 6)
  })

  it('past the beach line wades at sea level', () => {
    expect(groundAltitudeAt(10, 200)).toBeCloseTo(0, 6)
  })

  it('dock deck rides 0.6 above its local band: sand entrance, water end', () => {
    expect(groundAltitudeAt(18, DOCK.longDeg)).toBeCloseTo(SAND_ALTITUDE + DOCK.deckHeightM, 6)
    expect(groundAltitudeAt(14, DOCK.longDeg)).toBeCloseTo(DOCK.deckHeightM, 6)
  })

  it('beside the dock (outside half width) is plain sand', () => {
    expect(onDockStrip(18, DOCK.longDeg + 3)).toBe(false)
    expect(groundAltitudeAt(18, DOCK.longDeg + 3)).toBeCloseTo(SAND_ALTITUDE, 6)
  })

  it('groundHeightAt agrees with groundAltitudeAt through the pole transform', () => {
    const pole = latLongToUnit(18, DOCK.longDeg)
    expect(groundHeightAt(pole)).toBeCloseTo(
      PLANET_RADIUS + groundAltitudeAt(18, DOCK.longDeg),
      6,
    )
  })
})

describe('meridianYaw (placement rule 3)', () => {
  const worldNorthAt = (lat: number, long: number) => {
    // Numeric derivative toward increasing latitude.
    const a = latLongToUnit(lat, long)
    const b = latLongToUnit(lat + 0.01, long)
    return b.sub(a).normalize()
  }

  it.each([
    [45, 60],
    [18, 0],
    [50, 300],
    [22, 180],
  ])('local +Z points north along the meridian at lat %d long %d', (lat, long) => {
    const unit = latLongToUnit(lat, long)
    const q = surfaceQuaternion(unit)
    // Local +Z rotated by meridianYaw around local Y, then into world by q.
    const world = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), meridianYaw(lat, long)),
      )
      .applyQuaternion(q)
    expect(world.dot(worldNorthAt(lat, long))).toBeGreaterThan(0.999)
  })

  it('meridian-aligned +Z stays tangent (perpendicular to the normal)', () => {
    const unit = latLongToUnit(33, 123)
    const q = surfaceQuaternion(unit)
    const world = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), meridianYaw(33, 123)),
      )
      .applyQuaternion(q)
    expect(Math.abs(world.dot(unit))).toBeLessThan(1e-6)
  })
})
