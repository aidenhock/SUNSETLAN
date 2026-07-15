import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  DOCK,
  GRASS_ALTITUDE,
  PLANET_RADIUS,
  SAND_ALTITUDE,
} from '../scene/planetConfig'
import { latLongToUnit } from './planetMath'
import { groundHeightAt } from './usePlanetController'

/** Planet-local pole direction for "standing at lat/long". */
const poleAt = (lat: number, long: number) => latLongToUnit(lat, long)

describe('groundHeightAt (analytic terrain)', () => {
  it('spawn (island center) stands on grass', () => {
    expect(groundHeightAt(poleAt(90, 0))).toBeCloseTo(PLANET_RADIUS + GRASS_ALTITUDE, 6)
  })

  it('beach between grass line and island edge stands on sand', () => {
    expect(groundHeightAt(poleAt(25, 200))).toBeCloseTo(PLANET_RADIUS + SAND_ALTITUDE, 6)
  })

  it('past the beach line wades at sea level', () => {
    expect(groundHeightAt(poleAt(10, 200))).toBeCloseTo(PLANET_RADIUS, 6)
  })

  it('the dock deck is walkable along its strip', () => {
    expect(groundHeightAt(poleAt(18, DOCK.longDeg))).toBeCloseTo(
      PLANET_RADIUS + DOCK.topAltitude,
      6,
    )
  })

  it('beside the dock (outside half width) is beach sand, not the deck', () => {
    // 3 degrees of longitude ≈ 3.5 m cross-track at lat 18 — past the deck
    // edge but still inside the island cap (edge at lat 15).
    expect(groundHeightAt(poleAt(18, DOCK.longDeg + 3))).toBeCloseTo(
      PLANET_RADIUS + SAND_ALTITUDE,
      6,
    )
  })

  it('dock end past the island edge still stands on the deck, not in water', () => {
    expect(groundHeightAt(poleAt(14.2, DOCK.longDeg))).toBeCloseTo(
      PLANET_RADIUS + DOCK.topAltitude,
      6,
    )
  })
})
