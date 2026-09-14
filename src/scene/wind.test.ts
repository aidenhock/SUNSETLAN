import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  GROOVE,
  WIND,
  grooveBounce,
  grooveBpm,
  grooveCrownLean,
  grooveLean,
  grooveSquash,
  windDirAt,
  windLean,
} from './wind'
import {
  IDENTITY_Q,
  palmSwayMatrix,
  solveSwayDatum,
  surfacePartMatrix,
  swayMatrix,
  swayMatrixChain,
} from './instancing'
import { buildPalm } from './props'

/**
 * Wind: the palms sway (+ the groove pass) — pure-math coverage for
 * wind.ts and the sway-matrix builders in instancing.tsx. See
 * docs/build-log.md chapter 22 for the feature writeup.
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

describe('grooveLean / grooveCrownLean', () => {
  it('stays inside its amplitude, always', () => {
    for (let i = 0; i < 400; i++) {
      const t = i * 0.17
      const phase = i * 2.399
      expect(Math.abs(grooveLean(t, phase))).toBeLessThanOrEqual(GROOVE.leanRad + 1e-12)
      expect(Math.abs(grooveCrownLean(t, phase))).toBeLessThanOrEqual(GROOVE.crownRad + 1e-12)
    }
  })

  it('is periodic at one lean per TWO beats', () => {
    const period = (2 * 60) / GROOVE.bpm // seconds
    for (let i = 0; i < 20; i++) {
      const t = i * 0.29
      expect(grooveLean(t + period, 0.7)).toBeCloseTo(grooveLean(t, 0.7), 10)
      expect(grooveCrownLean(t + period, 0.7)).toBeCloseTo(grooveCrownLean(t, 0.7), 10)
    }
  })

  it('shifts with phase, so the grove is never a chorus line', () => {
    expect(Math.abs(grooveLean(3, 0) - grooveLean(3, 2.399))).toBeGreaterThan(0.01)
  })

  it('lags the trunk by exactly GROOVE.crownLag — the whip', () => {
    // The crown at time t matches the trunk shifted back by the lag, once
    // amplitude is divided out.
    const omega = (2 * Math.PI * (GROOVE.bpm / 60)) / 2
    const lead = GROOVE.crownLag / omega
    for (let i = 0; i < 20; i++) {
      const t = i * 0.31
      expect(grooveCrownLean(t, 0.4) / GROOVE.crownRad).toBeCloseTo(
        grooveLean(t + lead, 0.4) / GROOVE.leanRad,
        10,
      )
    }
    expect(GROOVE.crownLag).toBeGreaterThan(0)
  })

  it('sums with the wind to a trunk lean that never reads blown over', () => {
    const worstWind = WIND.baseRad + 0.4 * WIND.gustRad
    expect(worstWind + GROOVE.leanRad).toBeLessThan(0.16)
  })
})

describe('grooveBounce / grooveSquash / grooveBpm', () => {
  it('bounces up from rest only — a palm never sinks into the ground', () => {
    for (let i = 0; i < 400; i++) {
      const s = grooveBounce(i * 0.11, i * 2.399)
      expect(s).toBeGreaterThanOrEqual(1)
      expect(s).toBeLessThanOrEqual(1 + GROOVE.bounce + 1e-12)
    }
  })

  it('is periodic on the BEAT (twice as often as the lean)', () => {
    const beat = 60 / GROOVE.bpm
    for (let i = 0; i < 20; i++) {
      const t = i * 0.23
      expect(grooveBounce(t + beat, 1.1)).toBeCloseTo(grooveBounce(t, 1.1), 10)
    }
  })

  it('shifts with phase', () => {
    let maxDiff = 0
    for (let i = 0; i < 50; i++) {
      const t = i * 0.037
      maxDiff = Math.max(maxDiff, Math.abs(grooveBounce(t, 0) - grooveBounce(t, 1.7)))
    }
    expect(maxDiff).toBeGreaterThan(0.005)
  })

  it('counter-squashes x/z in step with the stretch', () => {
    expect(grooveSquash(1)).toBeCloseTo(1, 12)
    expect(grooveSquash(1 + GROOVE.bounce)).toBeCloseTo(1 - GROOVE.squash, 12)
    // Monotonic and always thinner, never fatter.
    for (let i = 0; i <= 10; i++) {
      const s = 1 + (GROOVE.bounce * i) / 10
      expect(grooveSquash(s)).toBeLessThanOrEqual(1 + 1e-12)
      expect(grooveSquash(s)).toBeGreaterThanOrEqual(1 - GROOVE.squash - 1e-12)
    }
  })

  it('jitters each palm tempo within ±bpmJitter, deterministically', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 200; i++) {
      const bpm = grooveBpm(i)
      expect(bpm).toBeGreaterThanOrEqual(GROOVE.bpm * (1 - GROOVE.bpmJitter) - 1e-9)
      expect(bpm).toBeLessThanOrEqual(GROOVE.bpm * (1 + GROOVE.bpmJitter) + 1e-9)
      expect(grooveBpm(i)).toBe(bpm) // deterministic
      seen.add(bpm)
    }
    expect(seen.size).toBeGreaterThan(150) // genuinely spread, not two buckets
  })
})

describe('swayMatrix / swayMatrixChain / palmSwayMatrix', () => {
  // A real palm placement (surfacePartMatrix — the same builder every
  // placed prop uses) and a real crown pivot from buildPalm itself.
  const placementM = surfacePartMatrix(30, 25, 0, 0, new THREE.Vector3(0, 0, 0), IDENTITY_Q, 1)
  const parts = buildPalm()
  const crownPart = parts.find((p) => p.sway?.crownPivot)
  const trunkPart = parts.find((p) => p.sway && !p.sway.crownPivot)
  if (!crownPart?.sway?.crownPivot) throw new Error('buildPalm did not tag a crown part')
  if (!trunkPart) throw new Error('buildPalm did not tag the trunk as a sway part')
  const pivot = crownPart.sway.crownPivot
  const BASE = new THREE.Vector3(0, 0, 0)
  const datum = solveSwayDatum(placementM, 3)

  it('leaves its pivot point fixed (single-link case)', () => {
    const M = swayMatrix(placementM, pivot, new THREE.Vector3(1, 0, 0), 0.3)
    const world = pivot.clone().applyMatrix4(M)
    const expected = pivot.clone().applyMatrix4(placementM)
    expect(world.distanceTo(expected)).toBeLessThan(1e-6)
  })

  it('keeps the trunk BASE planted at every instant', () => {
    const planted = BASE.clone().applyMatrix4(placementM)
    for (let i = 0; i < 120; i++) {
      const t = i * 0.083
      const trunkM = palmSwayMatrix(placementM, datum, undefined, t)
      const crownM = palmSwayMatrix(placementM, datum, pivot, t)
      expect(BASE.clone().applyMatrix4(trunkM).distanceTo(planted)).toBeLessThan(1e-9)
      // The crown mesh's own origin is irrelevant, but the trunk's must not
      // slide — that is the "no sliding base, no sinking palm" guarantee.
      expect(Number.isFinite(crownM.elements[0])).toBe(true)
    }
  })

  it('maps the crown pivot to placement × (pivot scaled by the bounce)', () => {
    // With the hinges at rest the whole matrix collapses to the bounce
    // scale — the pivot rides straight up the placement's local +Y.
    const s = 1.045
    const c = grooveSquash(s)
    const scaled = new THREE.Vector3(pivot.x * c, pivot.y * s, pivot.z * c)
    const M = swayMatrixChain(placementM, [
      { pivot: BASE, axis: datum.leanAxis, angle: 0 },
      { pivot: scaled, axis: datum.grooveAxis, angle: 0 },
    ]).multiply(new THREE.Matrix4().makeScale(c, s, c))
    expect(pivot.clone().applyMatrix4(M).distanceTo(scaled.clone().applyMatrix4(placementM)))
      .toBeLessThan(1e-9)
  })

  it('welds the crown to the trunk top — it never detaches while dancing', () => {
    for (let i = 0; i < 120; i++) {
      const t = i * 0.083
      const trunkM = palmSwayMatrix(placementM, datum, undefined, t, new THREE.Matrix4())
      const crownM = palmSwayMatrix(placementM, datum, pivot, t, new THREE.Matrix4())
      // The same prop-local point (the crown pivot) under both matrices:
      // the trunk carries it there, and the crown's own hinges fix it.
      const onTrunk = pivot.clone().applyMatrix4(trunkM)
      const onCrown = pivot.clone().applyMatrix4(crownM)
      expect(onCrown.distanceTo(onTrunk)).toBeLessThan(1e-9)
    }
  })

  it('leans the crown tip downwind', () => {
    const unit = new THREE.Vector3().setFromMatrixPosition(placementM).normalize()
    const worldWind = new THREE.Vector3()
    windDirAt(unit, worldWind)

    const angle = 0.05 // a representative small positive lean
    const M = swayMatrix(placementM, pivot, datum.leanAxis, angle)
    const tipLocal = pivot.clone().add(new THREE.Vector3(0, 1, 0))
    const tipWorld = tipLocal.clone().applyMatrix4(M)
    const pivotWorld = pivot.clone().applyMatrix4(placementM)
    const displacement = tipWorld.clone().sub(pivotWorld)

    expect(displacement.dot(worldWind)).toBeGreaterThan(0)
  })

  it('carries the crown tip WITH the trunk lean', () => {
    // A positive trunk lean about the wind (lean) axis must move the crown
    // tip the same way it moves the trunk — the crown follows, it does not
    // stay behind on a rigid stalk.
    const unit = new THREE.Vector3().setFromMatrixPosition(placementM).normalize()
    const worldWind = new THREE.Vector3()
    windDirAt(unit, worldWind)
    const tipLocal = pivot.clone().add(new THREE.Vector3(0, 1, 0))

    const rest = swayMatrixChain(placementM, [], new THREE.Matrix4())
    const tipRest = tipLocal.clone().applyMatrix4(rest)

    // Trunk link only (hinged at the base), crown hinges at rest.
    const leaned = swayMatrixChain(
      placementM,
      [
        { pivot: BASE, axis: datum.leanAxis, angle: 0.08 },
        { pivot, axis: datum.grooveAxis, angle: 0 },
      ],
      new THREE.Matrix4(),
    )
    const tipLeaned = tipLocal.clone().applyMatrix4(leaned)
    expect(tipLeaned.clone().sub(tipRest).dot(worldWind)).toBeGreaterThan(0.05)
  })

  it('never leans hard enough to look blown over', () => {
    // A sanity ceiling on the angle itself, independent of the envelope
    // tests above — the design goal in one assertion.
    expect(WIND.baseRad + WIND.gustRad + GROOVE.leanRad).toBeLessThan(0.16) // < ~9.2°
  })
})
