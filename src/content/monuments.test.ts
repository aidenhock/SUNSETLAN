import { describe, expect, it } from 'vitest'
import { interactables } from './interactables'
import { monument, monuments, monumentYaw } from './monuments'

/**
 * The monument index is the file the world gets rearranged from, so it
 * gets the guardrails: a typo'd id, a duplicate, or a coordinate off the
 * island should fail here rather than as a prop floating in the sea.
 */

describe('monument index', () => {
  it('has unique ids', () => {
    const ids = monuments.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps every monument on the island', () => {
    for (const m of monuments) {
      // Island edge is polar 75° → lat 15; the pole is 90.
      expect(m.lat, `${m.id} latitude`).toBeGreaterThanOrEqual(13)
      expect(m.lat, `${m.id} latitude`).toBeLessThanOrEqual(90)
      expect(m.long, `${m.id} longitude`).toBeGreaterThanOrEqual(0)
      expect(m.long, `${m.id} longitude`).toBeLessThan(360)
      expect(Number.isFinite(m.facingDeg), `${m.id} facing`).toBe(true)
    }
  })

  it('backs every interactable with a monument of the same id', () => {
    for (const def of interactables) {
      expect(() => monument(def.id), `interactable ${def.id}`).not.toThrow()
      expect(monument(def.id).kind).toBe('interactable')
    }
  })

  it('converts facing to radians', () => {
    expect(monumentYaw('photos')).toBeCloseTo(Math.PI, 6) // 180°
    expect(monumentYaw('about')).toBe(0)
  })

  it('throws loudly on an unknown id', () => {
    expect(() => monument('no-such-thing')).toThrow(/no monument with id/)
  })

  it('gives the cemetery a footprint big enough to walk in', () => {
    const plot = monument('cemetery')
    expect(plot.size).toBeDefined()
    expect(plot.size!.widthM).toBeGreaterThanOrEqual(12)
    expect(plot.size!.depthM).toBeGreaterThanOrEqual(10)
  })

  it('floats the rift clear of the ground', () => {
    // Its lowest shards hang ~2.4 m below the anchor point.
    expect(monument('rift').liftM ?? 0).toBeGreaterThan(2.4)
  })
})
