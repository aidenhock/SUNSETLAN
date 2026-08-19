import { describe, expect, it } from 'vitest'
import { placement } from '../content/placements'
import { PLANET_RADIUS } from './planetConfig'
import { bearingBetween, metresBetween, SIGNPOST_TARGETS } from './signpost'

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
