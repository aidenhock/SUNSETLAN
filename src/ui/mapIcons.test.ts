import { describe, expect, it } from 'vitest'
import { placement, placements } from '../content/placements'
import { PLANET_RADIUS } from '../scene/planetConfig'
import { CEMETERY_FOOTPRINT, DOCK_LINE, MARKERS, MOON_UNIT, SCATTER, SUN_UNIT } from './mapIcons'

/**
 * The map draws footprints, not pins, for the big things — so the
 * footprint has to be the real one. These pin the geometry that turns
 * world coordinates into map shapes.
 */

const metresApart = (a: { angleTo: (b: never) => number }, b: unknown) =>
  a.angleTo(b as never) * PLANET_RADIUS

describe('map footprints', () => {
  it('draws the cemetery at its real size', () => {
    const plot = placement('cemetery')
    expect(CEMETERY_FOOTPRINT).toHaveLength(4)
    const width = metresApart(CEMETERY_FOOTPRINT[0], CEMETERY_FOOTPRINT[1])
    const depth = metresApart(CEMETERY_FOOTPRINT[1], CEMETERY_FOOTPRINT[2])
    expect(width).toBeCloseTo(plot.size!.widthM, 0)
    expect(depth).toBeCloseTo(plot.size!.depthM, 0)
  })

  it('runs the dock down its meridian, sand to water', () => {
    const [top, end] = DOCK_LINE
    expect(metresApart(top, end)).toBeGreaterThan(8)
    // Both ends share a longitude: the dock follows one meridian.
    const longOf = (v: { x: number; z: number }) => Math.atan2(v.x, v.z)
    expect(longOf(top)).toBeCloseTo(longOf(end), 5)
  })
})

describe('map markers', () => {
  it('gives every drawn monument a colour of its own', () => {
    // Nothing falls through to an unstyled default.
    for (const m of MARKERS) {
      expect(m.icon.color).toMatch(/^#[0-9a-f]{6}$/i)
      expect(m.icon.size).toBeGreaterThan(0)
    }
  })

  it('leaves the footprint monuments and the scatter out of the pin list', () => {
    // MARKERS is the pin layer: named things only. The cemetery and the
    // dock are drawn as footprints, palms and rocks as nature, and a
    // collider-only entry has nothing to draw at all.
    const pinnable = placements.filter(
      (m) =>
        m.kind !== 'seat' &&
        m.kind !== 'scatter' &&
        m.type !== 'collider' &&
        m.id !== 'cemetery' &&
        m.id !== 'dock',
    )
    expect(MARKERS.length).toBe(pinnable.length)
  })

  it('draws the scattered nature, minus the shells', () => {
    expect(SCATTER.length).toBeGreaterThan(10)
    for (const s of SCATTER) expect(s.icon.shape).toBe('dot')
  })

  it('puts the sun and the moon on opposite sides of the world', () => {
    expect(SUN_UNIT.angleTo(MOON_UNIT)).toBeCloseTo(Math.PI - 2 * (4 * Math.PI) / 180, 3)
  })
})
