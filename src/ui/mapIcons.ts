import * as THREE from 'three'
import { placement, placements } from '../content/placements'
import { latLongToUnit } from '../controls/planetMath'
import { DOCK, PLANET_RADIUS } from '../scene/planetConfig'

/**
 * How the island's contents look from above — a Minecraft-style map
 * rather than a row of identical pins: things are drawn in their own
 * colours, and the big ones are drawn as their actual FOOTPRINT (the
 * cemetery is its walled plot, the dock is the dock).
 *
 * Presentation only. Positions still come from the world index
 * (`monuments.json` / `scatterProps`); nothing here decides where
 * anything stands.
 */

export type IconShape = 'dot' | 'square' | 'diamond' | 'star'

export interface MapIcon {
  color: string
  shape: IconShape
  /** Radius in map pixels at the desktop size. */
  size: number
  /** Soft halo behind it — fires and the rift give off light. */
  glow?: string
}

/** Per-monument look, keyed by id; anything unlisted falls back by kind. */
const BY_ID: Record<string, MapIcon> = {
  photos: { color: '#4a5568', shape: 'square', size: 2.2 }, // tripod
  contact: { color: '#d94f3d', shape: 'square', size: 2.2 }, // mailbox
  papers: { color: '#cfa76b', shape: 'square', size: 2.4 }, // corkboard
  about: { color: '#8d9488', shape: 'square', size: 2.6 }, // moai
  projects: { color: '#b98a4f', shape: 'square', size: 2.6 }, // palapa thatch
  music: { color: '#35a7a0', shape: 'square', size: 2.2 }, // stereo
  videos: { color: '#bfe0ff', shape: 'square', size: 2.2 }, // CRT screen
  rift: { color: '#8fe9ff', shape: 'star', size: 3.4, glow: 'rgba(95,216,255,0.6)' },
  campfire: { color: '#ff8c42', shape: 'dot', size: 2.6, glow: 'rgba(255,140,66,0.55)' },
  koa: { color: '#e07a5f', shape: 'dot', size: 2.2 },
  rowboat: { color: '#8a6a45', shape: 'dot', size: 2.4 },
  'memorial-1': { color: '#b5b0a4', shape: 'square', size: 1.6 },
  'memorial-2': { color: '#b5b0a4', shape: 'square', size: 1.6 },
  'memorial-3': { color: '#b5b0a4', shape: 'square', size: 1.6 },
}

const BY_KIND: Record<string, MapIcon> = {
  interactable: { color: '#fff3d6', shape: 'dot', size: 2.2 },
  prop: { color: '#a89680', shape: 'dot', size: 2 },
  npc: { color: '#e07a5f', shape: 'dot', size: 2.2 },
  structure: { color: '#9aa0a6', shape: 'square', size: 2.2 },
  seat: { color: '#8a6a45', shape: 'dot', size: 1.6 },
}

export interface MapMarker {
  unit: THREE.Vector3
  icon: MapIcon
}

/** Everything drawn as a single marker — the cemetery and the dock get
 *  footprints instead, and seats are drawn with the fire. */
export const MARKERS: MapMarker[] = placements
  .filter(
    (m) =>
      m.kind !== 'seat' &&
      m.kind !== 'scatter' &&
      m.type !== 'collider' &&
      m.id !== 'cemetery' &&
      m.id !== 'dock',
  )
  .map((m) => ({
    unit: latLongToUnit(m.lat, m.long),
    icon: BY_ID[m.id] ?? BY_KIND[m.kind] ?? BY_KIND.prop,
  }))

/** Scattered nature: palms read as green blobs, rocks as grey ones. */
export const SCATTER: MapMarker[] = placements
  .filter((p) => p.kind === 'scatter' && p.type !== 'shell') // shells are too small to read
  .map((p) => ({
    unit: latLongToUnit(p.lat, p.long),
    icon:
      p.type === 'palm'
        ? { color: '#3f8f4f', shape: 'dot' as const, size: 2.4 }
        : { color: '#9aa0a6', shape: 'dot' as const, size: 1.7 },
  }))

/** The log ring around the fire. */
export const SEATS: MapMarker[] = placements
  .filter((m) => m.kind === 'seat')
  .map((m) => ({ unit: latLongToUnit(m.lat, m.long), icon: BY_KIND.seat }))

/** Metres → degrees, for laying out a footprint on the sphere. */
const degPerMetreLat = 180 / (Math.PI * PLANET_RADIUS)
const degPerMetreLong = (lat: number) =>
  degPerMetreLat / Math.max(0.15, Math.cos((lat * Math.PI) / 180))

/**
 * The cemetery's walled plot as four corners, so the map shows the
 * shape you actually walk around instead of a dot.
 */
export const CEMETERY_FOOTPRINT: THREE.Vector3[] = (() => {
  const plot = placement('cemetery')
  const w = (plot.size?.widthM ?? 12) / 2
  const d = (plot.size?.depthM ?? 10) / 2
  const yaw = (plot.yawDeg * Math.PI) / 180
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  const corners: Array<[number, number]> = [
    [-w, d],
    [w, d],
    [w, -d],
    [-w, -d],
  ]
  return corners.map(([east, north]) => {
    const e = east * cos + north * sin
    const n = -east * sin + north * cos
    // Longitude degrees shrink as you go north, so each corner converts
    // at ITS OWN latitude — using the plot's centre for all four drew
    // the north edge ~2.4 m short of the fence you actually walk.
    const lat = plot.lat + n * degPerMetreLat
    return latLongToUnit(lat, plot.long + e * degPerMetreLong(lat))
  })
})()

/** The dock's centreline, from the sand out over the water. */
export const DOCK_LINE: THREE.Vector3[] = [
  latLongToUnit(DOCK.latMaxDeg, DOCK.longDeg),
  latLongToUnit(DOCK.latMinDeg, DOCK.longDeg),
]

/**
 * Where the sun and moon sit, as directions on the map. Both are
 * permanent places on this planet — sunset at longitude 0, night at
 * 180 — so the water can be painted as a gradient running between them.
 */
export const SUN_UNIT = latLongToUnit(4, 0)
export const MOON_UNIT = latLongToUnit(4, 180)
