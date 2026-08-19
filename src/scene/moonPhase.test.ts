import { describe, expect, it } from 'vitest'
import { moonPhase, SYNODIC_DAYS } from './moonPhase'

/**
 * The telescope claims to show tonight's moon, so the arithmetic behind
 * that claim gets pinned against dates whose phase is a matter of
 * record.
 */

const at = (iso: string) => moonPhase(new Date(iso))

describe('moon phase', () => {
  it('is new at a known new moon', () => {
    // 2000-01-06 18:14 UTC is the epoch the cycle counts from.
    const p = at('2000-01-06T18:14:00Z')
    expect(p.ageDays).toBeLessThan(0.05)
    expect(p.illumination).toBeLessThan(0.01)
    expect(p.name).toBe('New moon')
  })

  it('is full half a lunation later', () => {
    const half = new Date(Date.UTC(2000, 0, 6, 18, 14) + (SYNODIC_DAYS / 2) * 86_400_000)
    const p = moonPhase(half)
    expect(p.illumination).toBeGreaterThan(0.99)
    expect(p.name).toBe('Full moon')
  })

  it('waxes through the first half and wanes through the second', () => {
    const day = (n: number) =>
      moonPhase(new Date(Date.UTC(2000, 0, 6, 18, 14) + n * 86_400_000))
    expect(day(5).waxing).toBe(true)
    expect(day(5).name).toBe('Waxing crescent')
    expect(day(11).name).toBe('Waxing gibbous')
    expect(day(20).waxing).toBe(false)
    expect(day(20).name).toBe('Waning gibbous')
    expect(day(26).name).toBe('Waning crescent')
  })

  it('reaches the quarters near a quarter of the way round', () => {
    const q1 = moonPhase(new Date(Date.UTC(2000, 0, 6, 18, 14) + (SYNODIC_DAYS / 4) * 86_400_000))
    expect(q1.name).toBe('First quarter')
    expect(q1.illumination).toBeCloseTo(0.5, 2)
    const q3 = moonPhase(
      new Date(Date.UTC(2000, 0, 6, 18, 14) + ((SYNODIC_DAYS * 3) / 4) * 86_400_000),
    )
    expect(q3.name).toBe('Last quarter')
    expect(q3.illumination).toBeCloseTo(0.5, 2)
  })

  it('agrees with a real almanac date', () => {
    // The full moon of 26 May 2021 (a lunar eclipse, well documented).
    const p = at('2021-05-26T11:14:00Z')
    expect(p.illumination).toBeGreaterThan(0.99)
    expect(p.name).toBe('Full moon')
    // And the new moon a fortnight earlier.
    const n = at('2021-05-11T19:00:00Z')
    expect(n.illumination).toBeLessThan(0.02)
  })

  it('counts down to the next full and new moon', () => {
    const base = Date.UTC(2000, 0, 6, 18, 14)
    // At new moon: a full moon is half a lunation away, the next new a
    // whole one (never zero — that one has just happened).
    const atNew = moonPhase(new Date(base + 60_000))
    expect(atNew.daysToFull).toBeCloseTo(SYNODIC_DAYS / 2, 1)
    expect(atNew.daysToNew).toBeCloseTo(SYNODIC_DAYS, 1)
    // At full: the reverse.
    const atFull = moonPhase(new Date(base + (SYNODIC_DAYS / 2) * 86_400_000 + 60_000))
    expect(atFull.daysToFull).toBeCloseTo(SYNODIC_DAYS, 1)
    expect(atFull.daysToNew).toBeCloseTo(SYNODIC_DAYS / 2, 1)
  })

  it('never leaves the cycle, whatever date it is handed', () => {
    for (const iso of ['1969-07-20T20:17:00Z', '2026-08-19T00:00:00Z', '2099-12-31T23:59:00Z']) {
      const p = at(iso)
      expect(p.ageDays).toBeGreaterThanOrEqual(0)
      expect(p.ageDays).toBeLessThan(SYNODIC_DAYS)
      expect(p.illumination).toBeGreaterThanOrEqual(0)
      expect(p.illumination).toBeLessThanOrEqual(1)
    }
  })
})
