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

describe('Koa sits ON the dock deck (bug pass 2 — the floating NPC)', () => {
  it('altitude derives from the DECK strip, seat within a few cm of deck top', async () => {
    const { KOA_SEAT } = await import('../scene/UkulelePlayer')
    const { MAP } = await import('../scene/planetConfig')
    // The deck exists at his latitude, and his altitude is the strip's
    // analytic top (same groundAltitudeAt the controller walks) — never
    // the sand/water band under his overhang.
    expect(onDockStrip(MAP.ukulelePlayer.lat, DOCK.longDeg)).toBe(true)
    const deckTop = groundAltitudeAt(MAP.ukulelePlayer.lat, DOCK.longDeg)
    expect(KOA_SEAT.deckTopAlt).toBeCloseTo(deckTop, 10)
    // Seat contact (root + torso-bottom offset) bites ≤ 5 cm into the top.
    const seat = KOA_SEAT.altitude + KOA_SEAT.seatToRootM
    expect(deckTop - seat).toBeGreaterThanOrEqual(0)
    expect(deckTop - seat).toBeLessThanOrEqual(0.05)
  })

  it('his body OVERLAPS the walkable deck — never hovers past the edge', async () => {
    const { MAP } = await import('../scene/planetConfig')
    const polar = THREE.MathUtils.degToRad(90 - MAP.ukulelePlayer.lat)
    const dLong = ((MAP.ukulelePlayer.long - DOCK.longDeg + 540) % 360) - 180
    const crossM = Math.abs(THREE.MathUtils.degToRad(dLong)) * Math.sin(polar) * PLANET_RADIUS
    // Butt on the deck (inside the half-width), close enough to the edge
    // that the legs still dangle over the water side.
    expect(crossM).toBeLessThan(DOCK.halfWidthM)
    expect(crossM).toBeGreaterThan(DOCK.halfWidthM - 0.25)
  })
})
