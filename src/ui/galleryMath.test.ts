import { describe, expect, it } from 'vitest'
import { neighborIndices, pageCount, pageLabel, pageOf, pageRange, wrapIndex } from './galleryMath'

describe('gallery pagination math (13 photos, 6 per page)', () => {
  it('counts pages with a short last page', () => {
    expect(pageCount(13)).toBe(3)
    expect(pageCount(12)).toBe(2)
    expect(pageCount(1)).toBe(1)
    expect(pageCount(0)).toBe(1) // empty gallery still has one (empty) page
  })

  it('maps photo indices to their page — the grid follows the viewer', () => {
    expect(pageOf(0)).toBe(0)
    expect(pageOf(5)).toBe(0)
    expect(pageOf(6)).toBe(1)
    expect(pageOf(12)).toBe(2)
  })

  it('slices pages half-open, clamped to the total', () => {
    expect(pageRange(0, 13)).toEqual({ start: 0, end: 6 })
    expect(pageRange(1, 13)).toEqual({ start: 6, end: 12 })
    expect(pageRange(2, 13)).toEqual({ start: 12, end: 13 })
  })

  it('labels pages 1-based ("7–12 of 13"; single item drops the range)', () => {
    expect(pageLabel(0, 13)).toBe('1–6 of 13')
    expect(pageLabel(1, 13)).toBe('7–12 of 13')
    expect(pageLabel(2, 13)).toBe('13 of 13')
  })

  it('wraps viewer navigation continuously across all photos', () => {
    expect(wrapIndex(13, 13)).toBe(0)
    expect(wrapIndex(-1, 13)).toBe(12)
    expect(wrapIndex(5, 13)).toBe(5)
  })

  it('preloads exactly the wrapped ±1 neighbors', () => {
    expect(neighborIndices(0, 13)).toEqual([12, 1])
    expect(neighborIndices(12, 13)).toEqual([11, 0])
    expect(neighborIndices(6, 13)).toEqual([5, 7])
  })

  it('degenerate galleries never preload themselves', () => {
    expect(neighborIndices(0, 1)).toEqual([])
    expect(neighborIndices(0, 2)).toEqual([1])
  })
})
