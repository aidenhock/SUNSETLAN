import { describe, expect, it } from 'vitest'
import {
  arcMeters,
  cameraBearing,
  cellCenter,
  cellIndex,
  cellsWithinRange,
  LAT_BANDS,
  loadExplored,
  LONG_SECTORS,
  projectPolar,
  saveExplored,
  TOTAL_CELLS,
} from './minimapMath'

describe('minimap projection (compass: long 0 up)', () => {
  it('the pole projects to the centre', () => {
    const p = projectPolar(90, 123, 65)
    expect(Math.hypot(p.x, p.y)).toBeLessThan(1e-9)
  })
  it('long 0 points up, long 90 points right, rim lands on the radius', () => {
    const up = projectPolar(13, 0, 65)
    expect(up.x).toBeCloseTo(0, 6)
    expect(up.y).toBeCloseTo(-65, 6)
    const right = projectPolar(13, 90, 65)
    expect(right.x).toBeCloseTo(65, 6)
    expect(right.y).toBeCloseTo(0, 6)
  })
  it('latitudes beyond the rim clamp to the rim', () => {
    const p = projectPolar(5, 180, 65)
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(65, 6)
  })
})

describe('exploration grid (8 bands × 24 sectors)', () => {
  it('cells tile the cap and round-trip through their centres', () => {
    expect(TOTAL_CELLS).toBe(LAT_BANDS * LONG_SECTORS)
    for (const idx of [0, 5, 23, 24, 100, TOTAL_CELLS - 1]) {
      const c = cellCenter(idx)
      expect(cellIndex(c.lat, c.long)).toBe(idx)
    }
  })
  it('longitude wraps into sectors', () => {
    expect(cellIndex(50, 359.9)).toBe(cellIndex(50, -0.1))
  })
  it('discovery marks only cells whose centre is in range', () => {
    const c = cellCenter(cellIndex(50, 100))
    const near = cellsWithinRange(c.lat, c.long, 6)
    expect(near).toContain(cellIndex(c.lat, c.long))
    // A 6 m range cannot reach a neighbouring band's centre (~9.2 m away).
    for (const idx of near) {
      const cc = cellCenter(idx)
      expect(arcMeters(c.lat, c.long, cc.lat, cc.long)).toBeLessThanOrEqual(6)
    }
  })
})

describe('camera bearing + persistence', () => {
  it('facing north (az = long) reads bearing 0', () => {
    expect(cameraBearing(120, (120 * Math.PI) / 180)).toBeCloseTo(0, 9)
  })
  it('persistence round-trips and tolerates junk + missing storage', () => {
    const mem = new Map<string, string>()
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    }
    saveExplored(storage, new Set([3, 44, 191]))
    expect([...loadExplored(storage)].sort((a, b) => a - b)).toEqual([3, 44, 191])
    mem.set('sunsetlan-explored-v1', '{bad json')
    expect(loadExplored(storage).size).toBe(0)
    expect(loadExplored(null).size).toBe(0)
    expect(() => saveExplored(null, new Set([1]))).not.toThrow()
  })
})
