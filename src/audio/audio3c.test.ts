import { describe, expect, it } from 'vitest'
import { crackleTarget, cryGain, musicTarget } from '../scene/AudioEmitters'
import { advanceCrab, CRAB_BAND, nextSnapDelay, type CrabState } from '../scene/crabWalk'
import {
  FOOTSTEPS,
  surfaceUnderfoot,
  surfOffset,
  terrainProfile,
} from '../scene/planetConfig'
import { ShuffleBag } from './bag'
import { poolSize } from './core'
import { fillPluck, mulberry32 } from './procedural'

describe('audio manifest (file-pool-first)', () => {
  // With files present, nextBuffer's pool branch runs — the procedural
  // fallback is structurally unreachable for these categories.
  it('the ingested pools are visible to the glob', () => {
    // Aiden's library counts after both ingests.
    expect(poolSize('splash')).toBe(15)
    expect(poolSize('waves')).toBe(7)
    expect(poolSize('seagulls')).toBe(8)
    expect(poolSize('campfire')).toBe(4)
    expect(poolSize('footsteps-grass')).toBe(31)
    expect(poolSize('footsteps-sand')).toBe(26)
    expect(poolSize('footsteps-dock')).toBe(44)
    // Music has no file yet — the generative pad territory.
    expect(poolSize('music')).toBe(0)
  })

  it('the pool glob can never see _originals backups', () => {
    // The manifest pattern is exactly one directory deep
    // (audio/<category>/<file>.mp3): a backup at
    // audio/<category>/_originals/<file>.mp3 is two deep and
    // structurally unmatchable. Assert against the live manifest keys.
    const files = import.meta.glob('../assets/audio/*/*.mp3') as Record<string, unknown>
    const keys = Object.keys(files)
    expect(keys.length).toBeGreaterThan(100)
    for (const key of keys) {
      expect(key).not.toContain('_originals')
      // One level between audio/ and the file, never more.
      expect(key.split('/assets/audio/')[1]?.split('/')).toHaveLength(2)
    }
  })
})

describe('shuffle bag (depth-2 anti-repeat)', () => {
  it('never picks either of the previous two, across long runs', () => {
    for (const size of [3, 4, 7, 26, 44]) {
      const bag = new ShuffleBag(size, mulberry32(size))
      let a = -1
      let b = -1
      for (let i = 0; i < 2000; i++) {
        const pick = bag.next()
        expect(pick).toBeGreaterThanOrEqual(0)
        expect(pick).toBeLessThan(size)
        expect(pick).not.toBe(a)
        expect(pick).not.toBe(b)
        b = a
        a = pick
      }
    }
  })
  it('degrades gracefully: 2 alternate, 1 repeats', () => {
    const two = new ShuffleBag(2, mulberry32(1))
    const seq = Array.from({ length: 8 }, () => two.next())
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1])
    const one = new ShuffleBag(1, mulberry32(1))
    expect(one.next()).toBe(0)
    expect(one.next()).toBe(0)
  })
})

describe('double-tap config', () => {
  it('keeps the 90 ms gap and the plant phases in planetConfig', () => {
    expect(FOOTSTEPS.jumpTapGapMs).toBe(90)
    expect(FOOTSTEPS.plantPhases).toHaveLength(2)
    expect(FOOTSTEPS.stepGainSprint).toBeGreaterThan(FOOTSTEPS.stepGainWalk)
  })
})

describe('music mixing targets', () => {
  it('uke crossfade: inside 8 m the uke owns; beyond 20 m full music', () => {
    expect(musicTarget(4, 100, false)).toBe(0)
    expect(musicTarget(14, 100, false)).toBeGreaterThan(0)
    expect(musicTarget(14, 100, false)).toBeLessThan(0.35)
    expect(musicTarget(25, 100, false)).toBeCloseTo(0.35, 5)
  })
  it('campfire crackle is PURE proximity — no nightMix term at all', () => {
    expect(crackleTarget(3)).toBeCloseTo(0.7, 5)
    expect(crackleTarget(2)).toBeCloseTo(0.7, 5)
    expect(crackleTarget(12)).toBe(0)
    expect(crackleTarget(20)).toBe(0)
    const mid = crackleTarget(7.5)
    expect(mid).toBeGreaterThan(0.2)
    expect(mid).toBeLessThan(0.5)
    // The signature itself is the proof: arity 1, distance only.
    expect(crackleTarget.length).toBe(1)
  })

  it('gull cry gain is full under the orbit (≤10 m) and gone past 30 m', () => {
    expect(cryGain(5)).toBeCloseTo(1.08, 5)
    expect(cryGain(10)).toBeCloseTo(1.08, 5)
    // Standing under a gull (orbit altitude ~12 m) is clearly audible.
    expect(cryGain(12)).toBeGreaterThan(1.0)
    expect(cryGain(30)).toBe(0)
    expect(cryGain(45)).toBe(0)
    const mid = cryGain(20)
    expect(mid).toBeGreaterThan(0.4)
    expect(mid).toBeLessThan(0.7)
    // Strictly monotone across the band — the swell/fade shape.
    expect(cryGain(12)).toBeGreaterThan(cryGain(15))
    expect(cryGain(15)).toBeGreaterThan(cryGain(25))
  })

  it('campfire ducks to 0.6 inside 4 m; modal ducks to ~0.2', () => {
    expect(musicTarget(100, 3, false)).toBeCloseTo(0.35 * 0.6, 5)
    expect(musicTarget(100, 12, false)).toBeCloseTo(0.35, 5)
    expect(musicTarget(100, 100, true)).toBeCloseTo(0.2, 2)
  })
})

describe('crab walk invariants', () => {
  it('long random runs stay in the sand band and never end up wet', () => {
    const rng = mulberry32(99)
    const crab: CrabState = { lat: 19, long: 20, heading: 1, state: 'walk', timer: 1, phase: 0 }
    let t = 0
    for (let i = 0; i < 30000; i++) {
      t += 1 / 60
      advanceCrab(crab, 1 / 60, t, rng)
      expect(crab.lat).toBeGreaterThanOrEqual(CRAB_BAND.latMin - 1e-9)
      expect(crab.lat).toBeLessThanOrEqual(CRAB_BAND.latMax + 1e-9)
      const polar = ((90 - crab.lat) * Math.PI) / 180
      expect(terrainProfile(polar)).toBeGreaterThanOrEqual(surfOffset(polar, t) + 0.04 - 1e-9)
    }
  })
})

describe('crab snap cadence', () => {
  it('intervals stay within the 3–8 s bounds across many draws', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 5000; i++) {
      const d = nextSnapDelay(rng)
      expect(d).toBeGreaterThanOrEqual(3)
      expect(d).toBeLessThanOrEqual(8)
    }
    expect(nextSnapDelay(() => 0)).toBe(3)
    expect(nextSnapDelay(() => 1)).toBe(8)
  })
})

describe('surfaceUnderfoot (band boundaries)', () => {
  it('resolves grass/sand across the plateau edge and the dock strip', () => {
    expect(surfaceUnderfoot(60, 90, false)).toBe('grass')
    expect(surfaceUnderfoot(64.9, 90, false)).toBe('grass')
    expect(surfaceUnderfoot(65.1, 90, false)).toBe('sand')
    expect(surfaceUnderfoot(72, 90, false)).toBe('sand')
    // Dock strip: on the meridian within the half-width → dock; a few
    // degrees off → sand again. Wade always wins.
    expect(surfaceUnderfoot(70, 0, false)).toBe('dock')
    expect(surfaceUnderfoot(70, 0.5, false)).toBe('dock')
    expect(surfaceUnderfoot(70, 4, false)).toBe('sand')
    expect(surfaceUnderfoot(70, 0, true)).toBe('wade')
    // Outside the dock's lat range the meridian is plain ground.
    expect(surfaceUnderfoot(60, 0, false)).toBe('grass')
  })
})

describe('seeded pluck determinism', () => {
  it('same seed → identical buffer; different seed → different', () => {
    const a = new Float32Array(4096)
    const b = new Float32Array(4096)
    const c = new Float32Array(4096)
    fillPluck(a, 44100, 261.63, 7)
    fillPluck(b, 44100, 261.63, 7)
    fillPluck(c, 44100, 261.63, 8)
    expect(a).toEqual(b)
    expect(a.some((v, i) => v !== c[i])).toBe(true)
  })
})
