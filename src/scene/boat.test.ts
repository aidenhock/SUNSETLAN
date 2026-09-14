import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { groundAltitudeAt, onBoatDeck, onDockStrip } from '../controls/terrain'
import { useStore } from '../store/useStore'
import {
  advanceBoat,
  BOAT_BLOCKERS,
  boatStepBlocked,
  DOCK_NAMES,
  mooringLatLong,
  mooringUnit,
  stepOffUnit,
  type BoatMotion,
} from './boat'
import {
  BOAT,
  BOAT_DECK_M,
  DOCK,
  PLANET_RADIUS,
  SOUTH,
  SOUTH_DOCK,
  SURF,
  surfaceUnderfoot,
  terrainProfile,
} from './planetConfig'

const DOCKS = { north: DOCK, south: SOUTH_DOCK }

/** Perpendicular arc distance (m) from a dock's meridian plane. */
function crossTrackM(unit: THREE.Vector3, longDeg: number): number {
  const l = THREE.MathUtils.degToRad(longDeg)
  // Meridian plane normal = the east tangent at that longitude.
  const normal = new THREE.Vector3(Math.cos(l), 0, -Math.sin(l))
  return Math.asin(Math.abs(unit.dot(normal))) * PLANET_RADIUS
}

describe('mooring geometry (derived from the docks, never placed)', () => {
  for (const name of DOCK_NAMES) {
    it(`${name}: moors mooringSideM off the dock meridian`, () => {
      const cross = crossTrackM(mooringUnit(name), DOCKS[name].longDeg)
      expect(cross).toBeGreaterThan(BOAT.mooringSideM - 0.05)
      expect(cross).toBeLessThan(BOAT.mooringSideM + 0.05)
    })

    it(`${name}: the mooring is over water`, () => {
      const { lat, long } = mooringLatLong(name)
      // The BAND, not groundAltitudeAt: the moored hull is itself a
      // walkable deck now, so groundAltitudeAt here reports the boat's
      // floor. What must be under it is sea.
      expect(terrainProfile(THREE.MathUtils.degToRad(90 - lat))).toBeLessThan(0)
      // …and clear of the deck itself, so the hull never clips the planks.
      expect(onDockStrip(lat, long)).toBe(false)
    })

    it(`${name}: you step off onto the walkable strip`, () => {
      const u = stepOffUnit(name)
      const polar = Math.acos(THREE.MathUtils.clamp(u.y, -1, 1))
      const lat = 90 - THREE.MathUtils.radToDeg(polar)
      const long = THREE.MathUtils.radToDeg(Math.atan2(u.x, u.z))
      expect(onDockStrip(lat, long)).toBe(true)
    })
  }

  it('moors on the east side, clear of Koa on the west edge', () => {
    // Koa sits at long 359.05 (west of the meridian); the boat must not.
    expect(mooringLatLong('north').long).toBeGreaterThan(DOCK.longDeg)
  })
})

describe('advanceBoat', () => {
  const cfg = BOAT
  const step = (m: BoatMotion, dirYaw: number | null, mag: number, seconds: number) => {
    let arc = 0
    for (let i = 0; i < Math.round(seconds / 0.02); i++) {
      arc += advanceBoat(m, { dirYaw, mag }, 0.02, cfg)
    }
    return arc
  }

  it('accelerates to the top speed and no further', () => {
    const m: BoatMotion = { heading: 0, speed: 0 }
    step(m, 0, 1, 1)
    expect(m.speed).toBeGreaterThan(4.5)
    expect(m.speed).toBeLessThan(5.5) // accel 5 m/s² for one second
    step(m, 0, 1, 10)
    expect(m.speed).toBeCloseTo(cfg.maxSpeedMps, 5)
  })

  it('decelerates to a dead stop when the input lets go', () => {
    const m: BoatMotion = { heading: 0, speed: cfg.maxSpeedMps }
    step(m, null, 0, 1)
    expect(m.speed).toBeCloseTo(cfg.maxSpeedMps - cfg.decelMps2, 1)
    step(m, null, 0, 10)
    expect(m.speed).toBe(0)
  })

  it('eases toward a part-throttle target instead of snapping', () => {
    const m: BoatMotion = { heading: 0, speed: cfg.maxSpeedMps }
    step(m, 0, 0.5, 10)
    expect(m.speed).toBeCloseTo(cfg.maxSpeedMps * 0.5, 5)
  })

  it('turns the SHORT way across the ±π seam', () => {
    const m: BoatMotion = { heading: 3.0, speed: 0 }
    // Target just the other side of π: the short way is +0.28 rad (and
    // wraps past π), not −6.0 the long way round.
    step(m, -3.0, 1, 0.1)
    const turned = Math.atan2(Math.sin(m.heading - 3.0), Math.cos(m.heading - 3.0))
    expect(turned).toBeCloseTo(cfg.turnRateRadPerS * 0.1, 5)
    // Shrunk the gap to the target rather than opened it.
    const gap = Math.abs(Math.atan2(Math.sin(m.heading + 3.0), Math.cos(m.heading + 3.0)))
    expect(gap).toBeLessThan(Math.abs(Math.atan2(Math.sin(6.0), Math.cos(6.0))))
  })

  it('turns no faster than the turn rate', () => {
    const m: BoatMotion = { heading: 0, speed: 0 }
    advanceBoat(m, { dirYaw: Math.PI, mag: 1 }, 0.1, cfg)
    expect(Math.abs(m.heading)).toBeCloseTo(cfg.turnRateRadPerS * 0.1, 6)
  })

  it('travels speed × dt of arc', () => {
    const m: BoatMotion = { heading: 0, speed: cfg.maxSpeedMps }
    const arc = advanceBoat(m, { dirYaw: 0, mag: 1 }, 0.1, cfg)
    expect(arc * PLANET_RADIUS).toBeCloseTo(cfg.maxSpeedMps * 0.1, 5)
  })
})

describe('boatStepBlocked', () => {
  const rad = THREE.MathUtils.degToRad
  const margin = BOAT.shoreMarginM / PLANET_RADIUS

  it('stops the hull short of the island shore', () => {
    const limit = rad(75) + margin
    expect(boatStepBlocked(limit + 0.001, limit - 0.001)).toBe(true)
  })

  it('stops the hull short of the Antarctic shelf', () => {
    const limit = rad(SOUTH.waterlineDeg) + margin
    // Southern polar angles are π − (distance from the south pole).
    expect(boatStepBlocked(Math.PI - limit - 0.001, Math.PI - limit + 0.001)).toBe(true)
  })

  it('always lets the boat leave, on either shore', () => {
    const north = rad(75) + margin
    expect(boatStepBlocked(north - 0.004, north - 0.002)).toBe(false)
    const south = rad(SOUTH.waterlineDeg) + margin
    expect(boatStepBlocked(Math.PI - south + 0.004, Math.PI - south + 0.002)).toBe(false)
  })

  it('leaves the open ocean alone', () => {
    expect(boatStepBlocked(rad(100), rad(101))).toBe(false)
    expect(boatStepBlocked(rad(100), rad(99))).toBe(false)
  })

  it('lets the boat sit at, and leave, both moorings', () => {
    for (const name of DOCK_NAMES) {
      const u = mooringUnit(name)
      const polar = Math.acos(THREE.MathUtils.clamp(u.y, -1, 1))
      // Standing still there is legal, and so is heading further out.
      expect(boatStepBlocked(polar, polar + 0.0005 * (polar < Math.PI / 2 ? 1 : -1))).toBe(false)
    }
  })
})

describe('pier blockers', () => {
  it('leave every mooring OUTSIDE them, so a freshly boarded boat can move', () => {
    // A blocked step zeroes the throttle; a boat parked inside its own
    // blocker with the bow toward the pier would never leave the dock.
    for (const name of DOCK_NAMES) {
      const m = mooringUnit(name)
      for (const b of BOAT_BLOCKERS) {
        expect(m.angleTo(b.unit) * 55).toBeGreaterThan(b.radius + 0.05)
      }
    }
  })
})

describe('the moored boat is a walkable deck', () => {
  /** Metres of arc per degree of latitude (the deck test's own scaling). */
  const M_PER_DEG_LAT = (PLANET_RADIUS * Math.PI) / 180
  const moor = (at: 'north' | 'south') =>
    useStore.setState({ boat: { state: 'moored', at } })

  afterEach(() => useStore.setState({ boat: { state: 'moored', at: 'north' } }))

  it('floats the floor above the water it sits in', () => {
    // Three wave sines x 0.04 plus the surf swing: the highest the live
    // surface can ever reach beside the hull.
    expect(BOAT_DECK_M).toBeGreaterThan(3 * 0.04 + SURF.amplitudeM)
  })

  it('covers the hull footprint, and stops at its edge', () => {
    const { lat, long } = mooringLatLong('north')
    expect(onBoatDeck(lat, long)).toBe(true)

    // Along the meridian: inside each end, then 0.2 m past the bow/stern.
    const endDeg = (BOAT.hullLengthM / 2 - 0.1) / M_PER_DEG_LAT
    expect(onBoatDeck(lat + endDeg, long)).toBe(true)
    expect(onBoatDeck(lat - endDeg, long)).toBe(true)
    const pastDeg = (BOAT.hullLengthM / 2 + 0.2) / M_PER_DEG_LAT
    expect(onBoatDeck(lat + pastDeg, long)).toBe(false)
    expect(onBoatDeck(lat - pastDeg, long)).toBe(false)

    // Across it: 0.2 m outside the beam, either side, is water.
    const beamDeg =
      (BOAT.hullWidthM / 2 + 0.2) / (M_PER_DEG_LAT * Math.cos(THREE.MathUtils.degToRad(lat)))
    expect(onBoatDeck(lat, long + beamDeg)).toBe(false)
    expect(onBoatDeck(lat, long - beamDeg)).toBe(false)
  })

  it('only the mooring the boat is actually tied to', () => {
    const north = mooringLatLong('north')
    const south = mooringLatLong('south')
    moor('north')
    expect(onBoatDeck(north.lat, north.long)).toBe(true)
    expect(onBoatDeck(south.lat, south.long)).toBe(false)
    moor('south')
    expect(onBoatDeck(north.lat, north.long)).toBe(false)
    expect(onBoatDeck(south.lat, south.long)).toBe(true)
  })

  it('is gone while the boat is being boarded, driven or tied up', () => {
    const { lat, long } = mooringLatLong('north')
    for (const state of ['boarding', 'driving', 'landing'] as const) {
      useStore.setState({ boat: { state, at: 'north' } })
      expect(onBoatDeck(lat, long), state).toBe(false)
    }
  })

  it('you step ONTO the floor — the deck beats the water band', () => {
    const north = mooringLatLong('north')
    const south = mooringLatLong('south')
    moor('north')
    // Band is below sea level out here, so the floor is BOAT_DECK_M
    // above the WATER, never above the sea bed.
    expect(groundAltitudeAt(north.lat, north.long)).toBeCloseTo(BOAT_DECK_M, 6)
    expect(groundAltitudeAt(south.lat, south.long)).toBeLessThan(0)
    moor('south')
    expect(groundAltitudeAt(south.lat, south.long)).toBeCloseTo(BOAT_DECK_M, 6)
    expect(groundAltitudeAt(north.lat, north.long)).toBeLessThan(0)
  })

  it('sounds like the dock underfoot — hollow wood, no new pool', () => {
    const { lat, long } = mooringLatLong('north')
    moor('north')
    expect(surfaceUnderfoot(90 - lat, long, false, onBoatDeck(lat, long))).toBe('dock')
    // And the deck is dry: its floor stands clear of the live waterline.
    expect(groundAltitudeAt(lat, long)).toBeGreaterThan(SURF.amplitudeM)
  })

  it('leaves the dock deck alone — the hull moors clear of the planks', () => {
    for (const name of DOCK_NAMES) {
      const { lat } = mooringLatLong(name)
      const dock = name === 'north' ? DOCK : SOUTH_DOCK
      expect(onBoatDeck(lat, dock.longDeg)).toBe(false)
    }
  })
})
