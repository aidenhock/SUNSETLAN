/** Pure math for the minimap HUD (vitest-pinned): the polar projection
 * (centre = pole, long 0 at top — the sunset side is always "north",
 * so the map doubles as a compass), the 8×24 exploration grid, and
 * range-based cell discovery. No three.js, no DOM. */

export const LAT_EDGE = 13 // map rim = dock end / wading edge
export const LAT_BANDS = 8
export const LONG_SECTORS = 24
export const TOTAL_CELLS = LAT_BANDS * LONG_SECTORS
export const STORAGE_KEY = 'sunsetlan-explored-v1'

const BAND_DEG = (90 - LAT_EDGE) / LAT_BANDS
const SECTOR_DEG = 360 / LONG_SECTORS
const M_PER_DEG = (55 * Math.PI) / 180 // planet radius 55

const wrap360 = (d: number) => ((d % 360) + 360) % 360

/** Polar projection to map pixels: r grows from the pole outward,
 * long 0 points UP (screen −y), long 90 (east) points right. */
export function projectPolar(lat: number, long: number, radiusPx: number): { x: number; y: number } {
  const r = (Math.min(90 - lat, 90 - LAT_EDGE) / (90 - LAT_EDGE)) * radiusPx
  const a = (long * Math.PI) / 180
  return { x: r * Math.sin(a), y: -r * Math.cos(a) }
}

/** Map radius (px fraction of the rim) at a given latitude. */
export function radiusAtLat(lat: number, radiusPx: number): number {
  return (Math.min(90 - lat, 90 - LAT_EDGE) / (90 - LAT_EDGE)) * radiusPx
}

export function cellIndex(lat: number, long: number): number {
  const band = Math.min(LAT_BANDS - 1, Math.max(0, Math.floor((90 - lat) / BAND_DEG)))
  const sector = Math.min(LONG_SECTORS - 1, Math.floor(wrap360(long) / SECTOR_DEG))
  return band * LONG_SECTORS + sector
}

export function cellCenter(index: number): { lat: number; long: number } {
  const band = Math.floor(index / LONG_SECTORS)
  const sector = index % LONG_SECTORS
  return { lat: 90 - (band + 0.5) * BAND_DEG, long: (sector + 0.5) * SECTOR_DEG }
}

/** Approximate great-circle meters between two lat/long points. */
export function arcMeters(latA: number, longA: number, latB: number, longB: number): number {
  const dLat = (latA - latB) * M_PER_DEG
  const meanPolar = ((180 - latA - latB) / 2) * (Math.PI / 180)
  const dLong = (wrap360(longA - longB + 180) - 180) * M_PER_DEG * Math.sin(meanPolar)
  return Math.hypot(dLat, dLong)
}

/** Cells whose CENTRE lies within rangeM of the player — checked over
 * the player's cell plus its 3×3 neighbourhood (cheap, allocation-free
 * apart from the result array). */
export function cellsWithinRange(lat: number, long: number, rangeM: number): number[] {
  const here = cellIndex(lat, long)
  const band = Math.floor(here / LONG_SECTORS)
  const sector = here % LONG_SECTORS
  const out: number[] = []
  for (let db = -1; db <= 1; db++) {
    const b = band + db
    if (b < 0 || b >= LAT_BANDS) continue
    for (let ds = -1; ds <= 1; ds++) {
      const sIdx = (sector + ds + LONG_SECTORS) % LONG_SECTORS
      const idx = b * LONG_SECTORS + sIdx
      const c = cellCenter(idx)
      if (arcMeters(lat, long, c.lat, c.long) <= rangeM) out.push(idx)
    }
  }
  return out
}

/** Compass bearing (radians, 0 = map-up/long 0) the camera faces —
 * derived from the established az↔north mapping (view faces north when
 * azimuth equals the standing longitude). */
export function cameraBearing(longDeg: number, azimuthRad: number): number {
  return (longDeg * Math.PI) / 180 - azimuthRad
}

export function loadExplored(storage: Pick<Storage, 'getItem'> | null): Set<number> {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((n) => Number.isInteger(n) && n >= 0 && n < TOTAL_CELLS) as number[])
  } catch {
    return new Set()
  }
}

export function saveExplored(storage: Pick<Storage, 'setItem'> | null, explored: Set<number>): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify([...explored]))
  } catch {
    // No-storage environments silently skip persistence.
  }
}
