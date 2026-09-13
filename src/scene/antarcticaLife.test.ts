import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { AURORA_QUADS, buildAuroraLayout } from './auroraLayout'
import { placements } from '../content/placements'
import { groundAltitudeAt } from '../controls/terrain'
import { mulberry32 } from './geometryUtils'
import {
  advancePenguin,
  PENGUIN_BAND,
  PENGUIN_DRY_ALT_M,
  penguinGroundAlt,
  penguinLat,
  startlePenguin,
  type PenguinState,
} from './penguinWalk'
import { footprintRadius } from './propFootprints'
import { PLANET_RADIUS, SOUTH_DOCK } from './planetConfig'

/**
 * ANTARCTICA LIFE — the invariants for the south cap's new residents.
 *
 * Three things are pinned here, all of them the kind of bug a screenshot
 * only catches by luck: a penguin that waddles into the sea, a placement
 * that stands on water or on the dock someone will moor a boat at, and
 * an aurora curtain that has drifted out of the strip of sky it is
 * supposed to hang in.
 */

const ANTARCTICA_IDS = [
  'igloo',
  'npc-sila-01',
  'npc-nanuq-01',
  'iceblock-01',
  'iceblock-02',
  'iceblock-03',
  'iceblock-04',
  'snowmound-01',
  'snowmound-02',
  'snowmound-03',
]

describe('penguin walk', () => {
  const fresh = (i: number): PenguinState => ({
    sp: 10 + i * 2,
    long: i * 47,
    heading: i * 1.1,
    state: 'pause',
    timer: 0.2,
    phase: 0,
  })

  it('stays inside the band and out of the water over a long run', () => {
    const rng = mulberry32(0x9e11a)
    for (let b = 0; b < 6; b++) {
      const p = fresh(b)
      for (let step = 0; step < 20_000; step++) {
        advancePenguin(p, 1 / 60, rng)
        expect(p.sp).toBeGreaterThanOrEqual(PENGUIN_BAND.spMin - 1e-9)
        expect(p.sp).toBeLessThanOrEqual(PENGUIN_BAND.spMax + 1e-9)
        expect(penguinGroundAlt(p.sp)).toBeGreaterThan(PENGUIN_DRY_ALT_M)
      }
    }
  })

  it('keeps a startled penguin on land too', () => {
    const rng = mulberry32(0x5171e)
    const p = fresh(4)
    for (let step = 0; step < 4000; step++) {
      // Startle it constantly, straight downhill toward the sea.
      if (step % 90 === 0) startlePenguin(p, 0)
      advancePenguin(p, 1 / 60, rng)
      expect(penguinGroundAlt(p.sp)).toBeGreaterThan(PENGUIN_DRY_ALT_M)
      expect(p.sp).toBeLessThanOrEqual(PENGUIN_BAND.spMax + 1e-9)
    }
  })

  it('walks at roughly the waddle speed', () => {
    const p: PenguinState = { sp: 14, long: 0, heading: 0, state: 'walk', timer: 99, phase: 0 }
    const before = p.sp
    for (let i = 0; i < 60; i++) advancePenguin(p, 1 / 60, () => 0.5)
    // Heading 0 is straight away from the pole: one second ≈ 0.7 m.
    const metres = ((p.sp - before) * Math.PI * PLANET_RADIUS) / 180
    expect(metres).toBeGreaterThan(0.6)
    expect(metres).toBeLessThan(0.8)
  })

  it('maps its polar angle back to a southern latitude', () => {
    expect(penguinLat(11)).toBeCloseTo(-79, 6)
    expect(penguinLat(21.5)).toBeCloseTo(-68.5, 6)
  })
})

describe('antarctica placements', () => {
  const byId = new Map(placements.map((p) => [p.id, p]))

  it('has every new placement on the south cap', () => {
    for (const id of ANTARCTICA_IDS) {
      const p = byId.get(id)
      expect(p, `placement ${id}`).toBeDefined()
      expect(p!.lat).toBeLessThan(-60)
    }
  })

  it('stands every one of them on land', () => {
    for (const id of ANTARCTICA_IDS) {
      const p = byId.get(id)!
      expect(groundAltitudeAt(p.lat, p.long), `${id} altitude`).toBeGreaterThan(0)
    }
  })

  it('keeps every one of them clear of the dock strip and its mooring side', () => {
    const mPerDegLat = (Math.PI * PLANET_RADIUS) / 180
    /** Metres from (lat, long) to the nearest point of a lat span at a longitude. */
    const metresToStrip = (lat: number, long: number, latA: number, latB: number) => {
      const nearestLat = THREE.MathUtils.clamp(lat, Math.min(latA, latB), Math.max(latA, latB))
      const dLat = (lat - nearestLat) * mPerDegLat
      const dLong =
        (((long - SOUTH_DOCK.longDeg + 540) % 360) - 180) *
        mPerDegLat *
        Math.cos(THREE.MathUtils.degToRad(nearestLat))
      return Math.hypot(dLat, dLong)
    }
    for (const id of ANTARCTICA_IDS) {
      const p = byId.get(id)!
      // The deck itself, lat −70 → −66…
      expect(
        metresToStrip(p.lat, p.long, SOUTH_DOCK.latMinDeg, SOUTH_DOCK.latMaxDeg),
        `${id} vs the dock`,
      ).toBeGreaterThan(3)
      // …and the water beside its far end, where a boat will moor.
      expect(metresToStrip(p.lat, p.long, -67, -66), `${id} vs the mooring`).toBeGreaterThan(3)
    }
  })

  it('sizes the ice chunks from their own geometry', () => {
    const measured = footprintRadius('iceblock')
    expect(measured).not.toBeNull()
    for (const id of ANTARCTICA_IDS.filter((i) => i.startsWith('iceblock'))) {
      expect(byId.get(id)!.blockerRadiusM).toBe(measured)
    }
  })

  it('leaves the wandering villager room to wander', () => {
    const nanuq = byId.get('npc-nanuq-01')!
    const igloo = byId.get('igloo')!
    const mPerDegLat = (Math.PI * PLANET_RADIUS) / 180
    const dLat = (nanuq.lat - igloo.lat) * mPerDegLat
    const dLong =
      (nanuq.long - igloo.long) *
      mPerDegLat *
      Math.cos(THREE.MathUtils.degToRad((nanuq.lat + igloo.lat) / 2))
    expect(Math.hypot(dLat, dLong)).toBeGreaterThan(6)
  })
})

describe('aurora layout', () => {
  const layout = buildAuroraLayout()

  it('hangs three curtains of 36 quads each', () => {
    expect(layout).toHaveLength(3)
    for (const c of layout) expect(c.quads).toHaveLength(AURORA_QUADS)
  })

  it('keeps every quad in the 26–34 m altitude band', () => {
    for (const c of layout) {
      for (const q of c.quads) {
        const r = q.position.length()
        expect(r).toBeGreaterThanOrEqual(PLANET_RADIUS + 26)
        expect(r).toBeLessThanOrEqual(PLANET_RADIUS + 34)
      }
    }
  })

  it('keeps every quad between 6° and 24° from the south pole', () => {
    for (const c of layout) {
      for (const q of c.quads) {
        expect(q.spDeg).toBeGreaterThanOrEqual(6)
        expect(q.spDeg).toBeLessThanOrEqual(24)
        // …and the stored angle must agree with where the quad actually is.
        const measured = THREE.MathUtils.radToDeg(
          q.position.angleTo(new THREE.Vector3(0, -1, 0)),
        )
        expect(measured).toBeCloseTo(q.spDeg, 4)
      }
    }
  })

  it('gives every quad a usable, upright basis', () => {
    for (const c of layout) {
      for (const q of c.quads) {
        expect(Number.isFinite(q.tangent.x + q.tangent.y + q.tangent.z)).toBe(true)
        expect(q.tangent.length()).toBeCloseTo(1, 6)
        expect(q.normal.length()).toBeCloseTo(1, 6)
        // The quad stands up along the surface normal: width ⟂ up.
        expect(Math.abs(q.tangent.dot(q.normal))).toBeLessThan(1e-6)
      }
    }
  })
})
