import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { latLongToUnit } from '../controls/planetMath'
import {
  apparentElevationDeg,
  arcForElevationDeg,
  CELESTIAL_ELEVATION_INLAND_DEG,
  CELESTIAL_ELEVATION_WADING_MIN_DEG,
  CELESTIAL_ELEVATION_WATERLINE_DEG,
  DISC_POLAR_MAX_DEG,
  DISC_POLAR_MIN_DEG,
  GLITTER,
  laneParams,
  TERRAIN,
} from './planetConfig'
import {
  discElevationDeg,
  discElevFromCameraDeg,
  floorDiscPolarDeg,
  limbElevationDeg,
  MOON_DISC_ANG_RAD_DEG,
  nightMixFromPoleZ,
  SET_VISIBLE_FLOOR,
  solveDiscPolarDeg,
  SUN_DISC_ANG_RAD_DEG,
} from './useSkyState'

/** nightMix for a visitor standing at (lat, long) — the pole-local z. */
const mixAt = (lat: number, long: number) => nightMixFromPoleZ(latLongToUnit(lat, long).z)

describe('nightMixFromPoleZ (two skies)', () => {
  it('is warm at spawn and on the whole sunset side', () => {
    expect(mixAt(90, 0)).toBeLessThan(0.15) // spawn pole
    expect(mixAt(17, 0)).toBe(0) // sunset beach
    expect(mixAt(40, 40)).toBeLessThan(0.1) // palapa, day-leaning
  })

  it('is full night on the night side (campfire, TV, rowboat)', () => {
    expect(mixAt(22, 180)).toBeGreaterThan(0.99)
    expect(mixAt(21, 150)).toBeGreaterThan(0.9) // TV glow must read
    expect(mixAt(18, 210)).toBeGreaterThan(0.99)
  })

  it('keeps the terminator mild — dusk-warm, never night', () => {
    // The tree ("dusk boundary west") stays on the warm side; its dusk feel
    // comes from the dome gradient overhead, not the fog/light mix.
    expect(mixAt(50, 300)).toBeLessThan(0.15)
    // East ring on the terminator plane: a touch duskier than the beaches,
    // still clearly warm.
    const east = mixAt(20, 90)
    expect(east).toBeGreaterThan(0.05)
    expect(east).toBeLessThan(0.4)
  })

  it('crossfades monotonically (no popping) walking long 0 → 180 on the ring', () => {
    let prev = mixAt(20, 0)
    for (let long = 5; long <= 180; long += 5) {
      const m = mixAt(20, long)
      expect(m).toBeGreaterThanOrEqual(prev - 1e-9)
      // Smooth: no single 5° step jumps more than a quarter of the range.
      expect(m - prev).toBeLessThan(0.25)
      prev = m
    }
    expect(prev).toBeGreaterThan(0.99)
  })

  it('celestial arc: high inland, TRUE SET at the waterline (v3.8)', () => {
    // Elevation rule endpoints + monotone descent across the beach band
    // and on into the wading clamp.
    expect(discElevationDeg(0)).toBeCloseTo(CELESTIAL_ELEVATION_INLAND_DEG, 5)
    expect(discElevationDeg(TERRAIN.plateauEndDeg)).toBeCloseTo(CELESTIAL_ELEVATION_INLAND_DEG, 5)
    expect(discElevationDeg(TERRAIN.waterlineDeg)).toBeCloseTo(
      CELESTIAL_ELEVATION_WATERLINE_DEG,
      5,
    )
    // The waterline endpoint sits BELOW horizontal (set into the sea) but
    // above the wading clamp — the disc never fully vanishes.
    expect(CELESTIAL_ELEVATION_WATERLINE_DEG).toBeLessThan(0)
    expect(discElevationDeg(TERRAIN.waterlineDeg + 5)).toBeCloseTo(
      CELESTIAL_ELEVATION_WADING_MIN_DEG,
      5,
    )
    let prev = discElevationDeg(TERRAIN.plateauEndDeg)
    for (let p = TERRAIN.plateauEndDeg; p <= TERRAIN.waterlineDeg + 5; p += 0.5) {
      const e = discElevationDeg(p)
      expect(e).toBeLessThanOrEqual(prev + 1e-9)
      prev = e
    }
  })

  it('solved disc yields the wanted apparent elevation on the home walk', () => {
    // Player on the long-0 meridian at the waterline: the solved sun disc
    // should sit ~12° above the sea horizon (arc solver round-trip).
    const p = latLongToUnit(15, 0)
    const arc = arcForElevationDeg(CELESTIAL_ELEVATION_WATERLINE_DEG)
    const polar = solveDiscPolarDeg(p.y, p.z, arc)
    const disc = latLongToUnit(90 - polar, 0)
    const actualArc = THREE.MathUtils.radToDeg(disc.angleTo(p))
    expect(
      apparentElevationDeg(THREE.MathUtils.degToRad(actualArc)),
    ).toBeCloseTo(CELESTIAL_ELEVATION_WATERLINE_DEG, 0)
  })

  it('screen-space set floor holds ≥55% visible from a low shore camera (v3.10)', () => {
    // Camera low behind a wading player at the sun's waterline: the raw
    // dial target sinks the disc too deep; the floored solve must keep
    // SET_VISIBLE_FLOOR of the disc above the camera's actual ocean limb.
    for (const [sign, rho] of [
      [1, SUN_DISC_ANG_RAD_DEG],
      [-1, MOON_DISC_ANG_RAD_DEG],
    ] as const) {
      // The REAL follow camera at the shore sits ~7 m toward the island and
      // above it (higher limb + extra arc to the disc) — this is the
      // geometry that sank the disc to a sliver pre-v3.10.
      const camLocal = latLongToUnit(21.5, sign === 1 ? 0 : 180).multiplyScalar(58.3)
      const rawTarget = 167.5 // the dial's actual waterline solve
      const floored = floorDiscPolarDeg(rawTarget, sign, camLocal, rho)
      const elev = discElevFromCameraDeg(floored, sign, camLocal)
      const limb = limbElevationDeg(camLocal.length())
      const visibleFraction = (elev - limb) / (2 * rho) + 0.5
      expect(visibleFraction).toBeGreaterThanOrEqual(SET_VISIBLE_FLOOR - 0.02)
      // The correction only engages when the raw target actually violates
      // (the sun's bigger disc does here; the moon may already satisfy).
      if (sign === 1) expect(floored).toBeLessThan(rawTarget)
    }
  })

  it('the floor never lowers a disc that already satisfies it', () => {
    const camLocal = latLongToUnit(80, 0).multiplyScalar(59)
    const high = 60
    expect(floorDiscPolarDeg(high, 1, camLocal, SUN_DISC_ANG_RAD_DEG)).toBe(high)
  })

  it('walk-away: lane multiplier fades in lockstep with the disc gate (v3.12)', () => {
    // The lane gate uses the disc fade (1 − smoothstep(0.35, 0.6, nightMix))
    // so both vanish together; assert monotone decay across the crossing.
    const mult = (longDeg: number) => {
      const z = latLongToUnit(20, longDeg).z
      const nm = nightMixFromPoleZ(z)
      return 1 - THREE.MathUtils.smoothstep(nm, 0.35, 0.6)
    }
    const m = [mult(30), mult(105), mult(128)]
    expect(m[0]).toBeGreaterThan(m[1])
    expect(m[1]).toBeGreaterThan(m[2])
    expect(m[2]).toBeLessThan(0.02)
  })

  it('lane corridor (v3.14): angular far / metric near, bounded height mapping', () => {
    const rho = 0.0656
    // The far end is ANGULAR (× the fragment's eye distance in-shader):
    // from the shore the water at the tangent limb (~11.3 m, eye ~1.35 m
    // over the sea) must give a far width narrower than the shore-held
    // metric near end — the corridor can never waist at a shore vantage.
    for (let elev = -20; elev <= 60; elev += 5) {
      const p = laneParams(elev, rho, 1)
      expect(p.halfFarRad * 11.3).toBeLessThan(p.halfNearM)
    }
    const low = laneParams(GLITTER.elevLowDeg, rho, 1)
    const high = laneParams(GLITTER.elevHighDeg, rho, 1)
    // Set: far = farWidthDisc disc-widths angular (half-width = k·ρ);
    // near = nearWidthDisc apparent disc-widths at the reference
    // distance, held at the shore.
    expect(low.halfFarRad).toBeCloseTo(GLITTER.farWidthDisc * rho, 6)
    expect(low.halfNearM).toBeCloseTo(GLITTER.nearWidthDisc * rho * GLITTER.nearRefM, 6)
    expect(low.opacity).toBeCloseTo(GLITTER.opacityLow, 6)
    // Inland-high: both endpoints scale by highWidthScale; opacity eases
    // down but only to the floor — never invisible while the disc shows.
    expect(high.halfFarRad).toBeCloseTo(low.halfFarRad * GLITTER.highWidthScale, 6)
    expect(high.halfNearM).toBeCloseTo(low.halfNearM * GLITTER.highWidthScale, 6)
    expect(high.opacity).toBeCloseTo(GLITTER.opacityFloor, 6)
    for (let elev = 0; elev <= 60; elev += 5) {
      expect(laneParams(elev, rho, 1).opacity).toBeGreaterThanOrEqual(
        GLITTER.opacityFloor - 1e-9,
      )
    }
    // Submergence is the only kill: opacity rides the visible-disc gate.
    expect(laneParams(0, rho, 0.5).opacity).toBeCloseTo(GLITTER.opacityLow, 6)
    expect(laneParams(0, rho, 0.2).opacity).toBeLessThan(GLITTER.opacityLow * 0.6)
    expect(laneParams(0, rho, 0).opacity).toBe(0)
    // Wobble amplitude stays well under the far→near width step at the
    // shore, so the wobbled edges can never fake a waist.
    const step = low.halfNearM - low.halfFarRad * 11.3
    expect(GLITTER.wobbleAmp * low.halfNearM).toBeLessThan(step * 0.55)
  })

  it('clamps keep the far body below the horizon (sun set at deep night)', () => {
    // Player at the night beach: the sun solve clamps to the home side and
    // the disc ends up far over the planet's shoulder — not visible.
    const p = latLongToUnit(17.5, 179)
    const arc = arcForElevationDeg(discElevationDeg(72.5))
    const polar = solveDiscPolarDeg(p.y, p.z, arc)
    expect(polar).toBeGreaterThanOrEqual(DISC_POLAR_MIN_DEG)
    expect(polar).toBeLessThanOrEqual(DISC_POLAR_MAX_DEG)
    const disc = latLongToUnit(90 - polar, 0)
    const arcToPlayer = THREE.MathUtils.radToDeg(disc.angleTo(p))
    expect(apparentElevationDeg(THREE.MathUtils.degToRad(arcToPlayer))).toBeLessThan(-10)
  })
})
