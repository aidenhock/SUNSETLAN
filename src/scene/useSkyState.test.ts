import { describe, expect, it } from 'vitest'
import { latLongToUnit } from '../controls/planetMath'
import { MOON_LOCAL, nightMixFromPoleZ, SUN_LOCAL } from './useSkyState'

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

  it('anchors the sun low over long 0 and the moon over long 180', () => {
    expect(SUN_LOCAL.z).toBeGreaterThan(0.9)
    expect(SUN_LOCAL.y).toBeGreaterThan(0.15)
    expect(MOON_LOCAL.z).toBeLessThan(-0.85)
    expect(MOON_LOCAL.y).toBeGreaterThan(0.25)
  })
})
