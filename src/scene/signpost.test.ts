import { describe, expect, it } from 'vitest'
import { placement } from '../content/placements'
import { PLANET_RADIUS } from './planetConfig'
import * as THREE from 'three'
import { bearingBetween, metresBetween, plank, SIGNPOST_TARGETS } from './signpost'

/**
 * The sign is only worth having if it cannot lie. These pin the two
 * numbers it letters onto its planks.
 */

const deg = (rad: number) => (rad * 180) / Math.PI

describe('signpost', () => {
  it('measures great-circle metres, not straight lines', () => {
    // Ten degrees along a meridian is ten degrees of arc, exactly.
    const d = metresBetween({ lat: 50, long: 0 }, { lat: 40, long: 0 })
    expect(d).toBeCloseTo((10 * Math.PI * PLANET_RADIUS) / 180, 4)
  })

  it('points north toward the pole and south away from it', () => {
    expect(deg(bearingBetween({ lat: 40, long: 30 }, { lat: 90, long: 0 }))).toBeCloseTo(0, 4)
    expect(Math.abs(deg(bearingBetween({ lat: 40, long: 30 }, { lat: 20, long: 30 })))).toBeCloseTo(
      180,
      3,
    )
  })

  it('points east for a landmark to the east', () => {
    const east = deg(bearingBetween({ lat: 30, long: 100 }, { lat: 30, long: 130 }))
    expect(east).toBeGreaterThan(0)
    expect(east).toBeLessThan(180)
  })

  // NOTE: the aim of each board is tested in signpostAim.test.ts, which
  // measures it through the scene's own placement matrix. The test that
  // used to live here checked the plank against a hand-written idea of
  // which way local +X faced — the same idea the code was written from,
  // so the two agreed with each other and were wrong together.

  it('letters the back face mirrored so both sides read', () => {
    const g = plank(0, 1, 0, 0)
    const nor = g.attributes.normal as THREE.BufferAttribute
    const uv = g.attributes.uv as THREE.BufferAttribute
    let front = -1
    let back = -1
    for (let i = 0; i < nor.count; i++) {
      // The tip vertex on each face: u should be 1 in front, 0 behind.
      if (nor.getZ(i) > 0.5) front = Math.max(front, uv.getX(i))
      if (nor.getZ(i) < -0.5) back = Math.max(back, 1 - uv.getX(i))
    }
    expect(front).toBeCloseTo(1, 2)
    expect(back).toBeCloseTo(1, 2)
    g.dispose()
  })

  it('names only landmarks that exist', () => {
    for (const t of SIGNPOST_TARGETS) {
      expect(() => placement(t.id), `signpost target ${t.id}`).not.toThrow()
      expect(t.label.length).toBeGreaterThan(0)
    }
  })

  it('stands close enough to spawn to be the first thing you read', () => {
    const post = placement('signpost')
    expect(metresBetween({ lat: 90, long: 0 }, post)).toBeLessThan(12)
  })
})
