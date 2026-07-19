import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  DOCK,
  GRASS_ALTITUDE,
  PLANET_RADIUS,
  TERRAIN,
  terrainProfile,
} from '../scene/planetConfig'
import { latLongToUnit, meridianYaw, surfaceQuaternion } from './planetMath'
import { groundAltitudeAt, groundHeightAt, onDockStrip } from './terrain'

const profileAtLat = (lat: number) => terrainProfile(THREE.MathUtils.degToRad(90 - lat))

describe('terrainProfile (v3.2 continuous surface, placement rule 4)', () => {
  it('spawn plateau stands at grass altitude', () => {
    expect(profileAtLat(90)).toBeCloseTo(GRASS_ALTITUDE, 6)
    expect(profileAtLat(28)).toBeCloseTo(GRASS_ALTITUDE, 6) // plateau to polar 63
  })

  it('crosses exactly zero at the waterline', () => {
    expect(profileAtLat(90 - TERRAIN.waterlineDeg)).toBeCloseTo(0, 6)
  })

  it('wades below sea level down the real slope past the waterline', () => {
    expect(profileAtLat(13)).toBeLessThan(0)
    expect(profileAtLat(9)).toBeCloseTo(TERRAIN.apronAltitude, 6)
  })

  it('is continuous across every band boundary (no jumps > 0.02 m)', () => {
    for (const edgeDeg of [
      TERRAIN.plateauEndDeg,
      TERRAIN.shoulderEndDeg,
      TERRAIN.waterlineDeg,
      TERRAIN.apronEndDeg,
    ]) {
      const e = THREE.MathUtils.degToRad(edgeDeg)
      const eps = THREE.MathUtils.degToRad(0.01)
      expect(Math.abs(terrainProfile(e + eps) - terrainProfile(e - eps))).toBeLessThan(0.02)
    }
  })

  it('descends monotonically from the plateau edge to the apron floor', () => {
    let prev = terrainProfile(THREE.MathUtils.degToRad(TERRAIN.plateauEndDeg))
    for (let d = TERRAIN.plateauEndDeg; d <= TERRAIN.apronEndDeg; d += 0.25) {
      const alt = terrainProfile(THREE.MathUtils.degToRad(d))
      expect(alt).toBeLessThanOrEqual(prev + 1e-9)
      prev = alt
    }
  })
})

describe('groundAltitudeAt (profile + dock strip)', () => {
  it('equals the terrain profile off the dock', () => {
    for (const [lat, long] of [
      [90, 0],
      [25, 100],
      [19, 40],
      [13, 200],
    ]) {
      expect(groundAltitudeAt(lat, long)).toBeCloseTo(profileAtLat(lat), 6)
    }
  })

  it('dock deck rides deckHeightM above the local profile, entrance to end', () => {
    expect(groundAltitudeAt(18, DOCK.longDeg)).toBeCloseTo(
      profileAtLat(18) + DOCK.deckHeightM,
      6,
    )
    expect(groundAltitudeAt(14, DOCK.longDeg)).toBeCloseTo(
      profileAtLat(14) + DOCK.deckHeightM,
      6,
    )
  })

  it('beside the dock (outside half width) is the plain profile', () => {
    expect(onDockStrip(18, DOCK.longDeg + 3)).toBe(false)
    expect(groundAltitudeAt(18, DOCK.longDeg + 3)).toBeCloseTo(profileAtLat(18), 6)
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
