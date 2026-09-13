import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  DOCK,
  GRASS_ALTITUDE,
  landmassAt,
  MAX_POLAR_RAD,
  maxWadePolarRad,
  PLANET_RADIUS,
  polarFromOwnPole,
  SOUTH,
  SOUTH_DOCK,
  SOUTH_MAX_POLAR_RAD,
  stepLeavesLandmass,
  surfaceUnderfoot,
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

describe('Antarctica: the SOUTH profile (mirrored, polar 90..180)', () => {
  const southAt = (sp: number) => terrainProfile(THREE.MathUtils.degToRad(180 - sp))

  it('stands at the snow altitude across the plateau, pole included', () => {
    expect(terrainProfile(Math.PI)).toBeCloseTo(SOUTH.snowAltitude, 6)
    expect(groundAltitudeAt(-90, 0)).toBeCloseTo(SOUTH.snowAltitude, 6)
    expect(southAt(SOUTH.plateauEndDeg)).toBeCloseTo(SOUTH.snowAltitude, 6)
  })

  it('crosses exactly zero at its waterline (lat −68)', () => {
    expect(southAt(SOUTH.waterlineDeg)).toBeCloseTo(0, 6)
    expect(groundAltitudeAt(-(90 - SOUTH.waterlineDeg), 40)).toBeCloseTo(0, 6)
  })

  it('ends on the apron floor, tucked under the ocean-floor sphere', () => {
    expect(southAt(SOUTH.apronEndDeg)).toBeCloseTo(SOUTH.apronAltitude, 6)
    // Between the two aprons the whole sphere sits at the same floor —
    // one continuous surface, no rim, no step at the equator.
    expect(terrainProfile(THREE.MathUtils.degToRad(90))).toBeCloseTo(
      SOUTH.apronAltitude,
      6,
    )
    expect(terrainProfile(THREE.MathUtils.degToRad(120))).toBeCloseTo(
      SOUTH.apronAltitude,
      6,
    )
    expect(SOUTH.apronAltitude).toBeLessThan(-0.4) // below radius 54.6
  })

  it('is continuous across every south band boundary (no jumps > 0.02 m)', () => {
    for (const sp of [
      SOUTH.plateauEndDeg,
      SOUTH.shoulderEndDeg,
      SOUTH.waterlineDeg,
      SOUTH.apronEndDeg,
    ]) {
      const e = THREE.MathUtils.degToRad(180 - sp)
      const eps = THREE.MathUtils.degToRad(0.01)
      expect(Math.abs(terrainProfile(e + eps) - terrainProfile(e - eps))).toBeLessThan(0.02)
    }
    // …and across the equator, where the two halves meet.
    const eq = Math.PI / 2
    const eps = THREE.MathUtils.degToRad(0.01)
    expect(Math.abs(terrainProfile(eq + eps) - terrainProfile(eq - eps))).toBeLessThan(0.02)
  })

  it('rises monotonically from the apron floor to the snow plateau', () => {
    let prev = terrainProfile(THREE.MathUtils.degToRad(180 - SOUTH.apronEndDeg))
    for (let sp = SOUTH.apronEndDeg; sp >= 0; sp -= 0.25) {
      const alt = terrainProfile(THREE.MathUtils.degToRad(180 - sp))
      expect(alt).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = alt
    }
  })
})

describe("Antarctica's dock strip", () => {
  it('is walkable from the shelf entrance out over the water', () => {
    expect(onDockStrip(-70, SOUTH_DOCK.longDeg)).toBe(true)
    expect(onDockStrip(-68, SOUTH_DOCK.longDeg)).toBe(true)
    expect(onDockStrip(-66, SOUTH_DOCK.longDeg)).toBe(true)
    // Outside the lat span and off the meridian: plain terrain.
    expect(onDockStrip(-72, SOUTH_DOCK.longDeg)).toBe(false)
    expect(onDockStrip(-64, SOUTH_DOCK.longDeg)).toBe(false)
    expect(onDockStrip(-68, SOUTH_DOCK.longDeg + 12)).toBe(false)
  })

  it('entrance is on land, far end is over water, deck rides above both', () => {
    expect(profileAtLat(-70)).toBeGreaterThan(0) // ice shelf
    expect(profileAtLat(-66)).toBeLessThan(0) // open water
    for (const lat of [-70, -68, -66]) {
      expect(groundAltitudeAt(lat, SOUTH_DOCK.longDeg)).toBeCloseTo(
        profileAtLat(lat) + SOUTH_DOCK.deckHeightM,
        6,
      )
    }
  })

  it('the north dock is untouched', () => {
    expect(groundAltitudeAt(18, DOCK.longDeg)).toBeCloseTo(
      profileAtLat(18) + DOCK.deckHeightM,
      6,
    )
    expect(surfaceUnderfoot(90 - 18, DOCK.longDeg, false)).toBe('dock')
    expect(surfaceUnderfoot(90 + 68, SOUTH_DOCK.longDeg, false)).toBe('dock')
  })
})

describe('stepLeavesLandmass (landmass-aware island clamp)', () => {
  const deg = THREE.MathUtils.degToRad

  it('north: blocks a step past the wade clamp, allows walking back in', () => {
    expect(stepLeavesLandmass(deg(70), deg(71))).toBe(false)
    expect(stepLeavesLandmass(MAX_POLAR_RAD, MAX_POLAR_RAD + 0.01)).toBe(true)
    // Inward from beyond the clamp is always legal — never get stuck.
    expect(stepLeavesLandmass(MAX_POLAR_RAD + 0.05, MAX_POLAR_RAD + 0.04)).toBe(false)
  })

  it('south: the same, mirrored about the equator', () => {
    const edge = maxWadePolarRad('south')
    expect(landmassAt(edge)).toBe('south')
    expect(stepLeavesLandmass(deg(170), deg(169))).toBe(false) // inland
    expect(stepLeavesLandmass(edge, edge - 0.01)).toBe(true) // out to sea
    expect(stepLeavesLandmass(edge - 0.05, edge - 0.04)).toBe(false) // walking back in
  })

  it('the two clamps are mirror images', () => {
    expect(maxWadePolarRad('north')).toBeCloseTo(MAX_POLAR_RAD, 12)
    expect(polarFromOwnPole(maxWadePolarRad('south'))).toBeCloseTo(SOUTH_MAX_POLAR_RAD, 12)
    expect(landmassAt(deg(89))).toBe('north')
    expect(landmassAt(deg(91))).toBe('south')
    expect(polarFromOwnPole(deg(160))).toBeCloseTo(deg(20), 12)
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
