import { describe, expect, it } from 'vitest'
import { crackleTarget, musicTarget } from '../scene/AudioEmitters'
import { advanceCrab, CRAB_BAND, type CrabState } from '../scene/crabWalk'
import {
  FOOTSTEPS,
  surfaceUnderfoot,
  surfOffset,
  terrainProfile,
} from '../scene/planetConfig'
import { ShuffleBag } from './bag'
import { fillPluck, mulberry32 } from './procedural'

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
