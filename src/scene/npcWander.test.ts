import { describe, expect, it } from 'vitest'
import { latLongToUnit } from '../controls/planetMath'
import { mulberry32 } from './geometryUtils'
import { PLANET_RADIUS } from './planetConfig'
import { advanceNpc, pickWanderTarget, type NpcState, type NpcWanderOpts } from './npcWander'

/**
 * TRUE great-circle metres, deliberately not the kernel's flat
 * lat/long conversion: a test that reuses the code's own approximation
 * agrees with it by construction and proves nothing. Over a few metres
 * on a 55 m planet the two differ by well under a centimetre.
 */
function arcM(a: { lat: number; long: number }, b: { lat: number; long: number }): number {
  return latLongToUnit(a.lat, a.long).angleTo(latLongToUnit(b.lat, b.long)) * PLANET_RADIUS
}
/** Slack for that conversion difference. */
const EPS = 0.06

const HOME = { lat: 40, long: 120 }

function fresh(): NpcState {
  return { lat: HOME.lat, long: HOME.long, heading: 0, state: 'pause', timer: 0, target: null }
}

function opts(partial: Partial<NpcWanderOpts> = {}): NpcWanderOpts {
  return {
    radiusM: 4,
    speedMps: 1.1,
    pauseMin: 1,
    pauseMax: 2,
    rand: mulberry32(1234),
    walkable: () => true,
    ...partial,
  }
}

describe('pickWanderTarget', () => {
  it('stays inside the radius', () => {
    const rand = mulberry32(7)
    for (let i = 0; i < 2000; i++) {
      const t = pickWanderTarget(HOME, 4, rand, () => true)
      expect(arcM(HOME, t)).toBeLessThanOrEqual(4 + EPS)
    }
  })

  it('only ever returns walkable ground', () => {
    const rand = mulberry32(9)
    // A hard fence: nothing north of home is walkable.
    const walkable = (lat: number) => lat <= HOME.lat
    for (let i = 0; i < 500; i++) {
      const t = pickWanderTarget(HOME, 6, rand, walkable)
      expect(walkable(t.lat)).toBe(true)
    }
  })

  it('falls back to home when nothing around is walkable', () => {
    const t = pickWanderTarget(HOME, 4, mulberry32(3), () => false)
    expect(t).toEqual(HOME)
  })
})

describe('advanceNpc', () => {
  it('pauses, walks, arrives, and pauses again', () => {
    const s = fresh()
    const o = opts()
    let arrivals = 0
    let wasWalking = false
    for (let i = 0; i < 60 * 120; i++) {
      advanceNpc(s, 1 / 60, HOME, o)
      if (wasWalking && s.state === 'pause') arrivals++
      wasWalking = s.state === 'walk'
    }
    // Two minutes of ambling is many round trips, not zero.
    expect(arrivals).toBeGreaterThan(5)
  })

  it('reaches its target rather than circling it', () => {
    const s = fresh()
    const o = opts({ pauseMin: 0, pauseMax: 0 })
    advanceNpc(s, 0.1, HOME, o) // ends the pause, picks a target
    const target = s.target
    expect(target).not.toBeNull()
    for (let i = 0; i < 60 * 30 && s.target === target; i++) {
      advanceNpc(s, 1 / 60, HOME, o)
    }
    expect(s.target).not.toBe(target) // it arrived and repicked
    expect(arcM(s, target!)).toBeLessThan(0.2)
  })

  it('never steps off walkable ground, over a long run', () => {
    const s = fresh()
    // A coastline through home: south of it is sea.
    const walkable = (lat: number) => lat >= HOME.lat - 0.01
    const o = opts({ radiusM: 8, walkable })
    for (let i = 0; i < 60 * 600; i++) {
      advanceNpc(s, 1 / 60, HOME, o)
      expect(walkable(s.lat)).toBe(true)
    }
  })

  it('never strays much past the radius from home', () => {
    const s = fresh()
    const o = opts({ radiusM: 4 })
    for (let i = 0; i < 60 * 600; i++) {
      advanceNpc(s, 1 / 60, HOME, o)
      expect(arcM(HOME, s)).toBeLessThanOrEqual(4 + EPS)
    }
  })

  it('is deterministic for a given seed', () => {
    const run = () => {
      const s = fresh()
      const o = opts({ rand: mulberry32(42) })
      for (let i = 0; i < 6000; i++) advanceNpc(s, 1 / 60, HOME, o)
      return [s.lat, s.long, s.heading]
    }
    expect(run()).toEqual(run())
  })

  it('idles in place when the ground around it is unwalkable', () => {
    const s = fresh()
    const o = opts({ walkable: () => false })
    for (let i = 0; i < 6000; i++) advanceNpc(s, 1 / 60, HOME, o)
    expect(arcM(HOME, s)).toBeLessThan(0.2)
  })
})
