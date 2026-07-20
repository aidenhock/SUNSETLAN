import * as THREE from 'three'
import { latLongToUnit } from '../controls/planetMath'

/**
 * Planet sizing, island bands, and the world map — the single source of
 * truth matching the approved top-down map in CLAUDE.md. Visuals, blockers,
 * and the analytic ground all read from here so they can never disagree.
 */
export const PLANET_RADIUS = 55
/** Beach line: the island cap covers ~37% of the sphere (polar angle 75°). */
export const ISLAND_POLAR_DEG = 75
/** Grass down to lat 24 → the sand ring reads as a beach (~9 m, lat 15–24). */
export const GRASS_POLAR_DEG = 66
/** Rotation clamp: the pole may wade ~2.5 m of arc past the beach line. */
export const MAX_POLAR_RAD = THREE.MathUtils.degToRad(ISLAND_POLAR_DEG) + 2.5 / PLANET_RADIUS

/** Island crossing ≈ 144 m → ~22 s walk, ~14 s sprint. */
export const MOVE_SPEED = 6.5
export const SPRINT_SPEED = 10
/** Joystick full deflection sprints (no Shift key on phones). */
export const SPRINT_JOY_THRESHOLD = 0.95

export const INTERACT_ARC_M = 2.5
/** Hysteresis: once nearby, stay nearby until past this radius (no flicker). */
export const INTERACT_EXIT_ARC_M = 3.0

/** Profile heights above sea level — shared by the terrain mesh and the
 * analytic ground (placement rule 4: they are the SAME function). */
export const SAND_ALTITUDE = 0.35
export const GRASS_ALTITUDE = 0.55
/** Placement rule 1: prop bases sink 0.1 m into the ground so they bite. */
export const SINK_M = 0.1

/**
 * The continuous terrain profile (v3.2, placement rule 4): one surface from
 * the grass plateau down through the beach to a submerged apron that ends
 * tucked under the ocean-floor sphere (radius 55 − 0.4) — never an exposed
 * rim. Chained smoothsteps give zero-slope joins, so the profile is C1-ish
 * smooth and monotone from the plateau out.
 */
export const TERRAIN = {
  /** Grass plateau ends (deg from the pole). */
  plateauEndDeg: 63,
  /** Rolling shoulder down to the sand altitude. */
  shoulderEndDeg: 67,
  /** Waterline: profile crosses exactly 0 here (= ISLAND_POLAR_DEG). */
  waterlineDeg: ISLAND_POLAR_DEG,
  /** Submerged apron ends here, below the ocean-floor sphere. */
  apronEndDeg: 81,
  apronAltitude: -0.9,
} as const

/** Altitude above sea level at a polar angle (radians from the pole). */
export function terrainProfile(polarRad: number): number {
  const p = THREE.MathUtils.radToDeg(polarRad)
  if (p <= TERRAIN.plateauEndDeg) return GRASS_ALTITUDE
  if (p <= TERRAIN.shoulderEndDeg) {
    return THREE.MathUtils.lerp(
      GRASS_ALTITUDE,
      SAND_ALTITUDE,
      THREE.MathUtils.smoothstep(p, TERRAIN.plateauEndDeg, TERRAIN.shoulderEndDeg),
    )
  }
  if (p <= TERRAIN.waterlineDeg) {
    return THREE.MathUtils.lerp(
      SAND_ALTITUDE,
      0,
      THREE.MathUtils.smoothstep(p, TERRAIN.shoulderEndDeg, TERRAIN.waterlineDeg),
    )
  }
  if (p <= TERRAIN.apronEndDeg) {
    return THREE.MathUtils.lerp(
      0,
      TERRAIN.apronAltitude,
      THREE.MathUtils.smoothstep(p, TERRAIN.waterlineDeg, TERRAIN.apronEndDeg),
    )
  }
  return TERRAIN.apronAltitude
}

/**
 * The dock: longitude 0, entrance on sand, last segments over open water.
 * Deck top sits deckHeightM above the LOCAL ground band (surface-snapped
 * segments), consumed by both the visuals and groundAltitudeAt.
 */
export const DOCK = {
  longDeg: 0,
  latMinDeg: 13,
  latMaxDeg: 24,
  halfWidthM: 1,
  deckHeightM: 0.6,
  plankThicknessM: 0.18,
  segmentCount: 5,
}

/** World map placements (lat, long) — CLAUDE.md v3 table. */
export const MAP = {
  tripod: { lat: 14, long: 0 }, // Photos — on the dock end, over water
  mailbox: { lat: 24, long: 6 }, // Contact — dock entrance
  palapa: { lat: 40, long: 40 }, // Projects — day-leaning side
  tree: { lat: 50, long: 300 }, // About — dusk boundary west
  campfire: { lat: 22, long: 180 }, // night beach
  bench: { lat: 22, long: 185.5 },
  musicUkulele: { lat: 22, long: 173 }, // Music — by the fire
  tv: { lat: 21, long: 150 }, // Videos — screen glow reads at night
  rowboat: { lat: 18, long: 210 },
} as const

/** Surf cycle (v3.3) — the single source for the water shader AND the wade
 * ripple: a slow vertical swing of the near-shore water surface that walks
 * the waterline up and down the sand ramp. */
export const SURF = {
  periodS: 5.2,
  amplitudeM: 0.06,
  /** Shore weighting ramps in across this polar band (degrees). */
  startDeg: 68,
  endDeg: ISLAND_POLAR_DEG,
} as const

/** Vertical surf offset (m) of the live water surface at polar/time. */
export function surfOffset(polarRad: number, timeS: number): number {
  const shore = THREE.MathUtils.smoothstep(
    THREE.MathUtils.radToDeg(polarRad),
    SURF.startDeg,
    SURF.endDeg,
  )
  return Math.sin((timeS * Math.PI * 2) / SURF.periodS) * SURF.amplitudeM * shore
}

/**
 * Celestial disc anchors (v3.4): each body's latitude is SOLVED from
 * CELESTIAL_ELEVATION_DEG — the disc center's apparent elevation above the
 * sea horizon as seen from its home beach. ~15° puts each disc in the sky,
 * clearly over the water, and each still sets into the sea behind you as
 * you cross (a little later than the old waterline placement). Lighting
 * uses its own higher anchors (see useSkyState) — a low disc must not
 * light the scene from below.
 */
export const CELESTIAL_ELEVATION_DEG = 26
/** Must match CelestialDome's BODY_R (discs sit just inside the dome). */
const DOME_BODY_R = 230
const EYE_R = PLANET_RADIUS + 2.4
/** Sea-horizon dip below horizontal from eye height (deg). */
const HORIZON_DIP_DEG = THREE.MathUtils.radToDeg(Math.acos(PLANET_RADIUS / EYE_R))

/** Apparent elevation (deg) of a dome body `arc` radians from the viewer. */
function apparentElevationDeg(arcRad: number): number {
  return THREE.MathUtils.radToDeg(
    Math.atan2(DOME_BODY_R * Math.cos(arcRad) - EYE_R, DOME_BODY_R * Math.sin(arcRad)),
  )
}

/** Disc latitude whose apparent elevation from the beach hits the target. */
function discLatFor(beachLatDeg: number, elevationAboveSeaDeg: number): number {
  const targetDeg = elevationAboveSeaDeg - HORIZON_DIP_DEG
  let bestArc = 90
  let bestErr = Infinity
  for (let d = 40; d <= 110; d += 0.25) {
    const err = Math.abs(apparentElevationDeg(THREE.MathUtils.degToRad(d)) - targetDeg)
    if (err < bestErr) {
      bestErr = err
      bestArc = d
    }
  }
  return beachLatDeg - bestArc
}

export const CELESTIAL = {
  sunLatDeg: discLatFor(17, CELESTIAL_ELEVATION_DEG),
  sunLongDeg: 0,
  moonLatDeg: discLatFor(17.5, CELESTIAL_ELEVATION_DEG),
  moonLongDeg: 180,
} as const

export interface Blocker {
  /** Planet-local unit direction of the obstacle. */
  unit: THREE.Vector3
  /** Blocking radius in meters of arc. */
  radius: number
}

export interface ScatterProp {
  lat: number
  long: number
  kind: 'palm' | 'rock' | 'shell'
  scale: number
}

/** Decorative scatter, re-scattered for the new bands (grass ≥ lat 24). */
export const scatterProps: ScatterProp[] = [
  // Palms on grass, loosely ringing the beach.
  { lat: 30, long: 25, kind: 'palm', scale: 1.1 },
  { lat: 28, long: 70, kind: 'palm', scale: 0.9 },
  { lat: 33, long: 110, kind: 'palm', scale: 1 },
  { lat: 29, long: 162, kind: 'palm', scale: 1.2 },
  { lat: 31, long: 198, kind: 'palm', scale: 1 },
  { lat: 27, long: 250, kind: 'palm', scale: 1.05 },
  { lat: 32, long: 288, kind: 'palm', scale: 0.95 },
  { lat: 29, long: 335, kind: 'palm', scale: 1.15 },
  { lat: 55, long: 120, kind: 'palm', scale: 1 },
  { lat: 62, long: 230, kind: 'palm', scale: 0.9 },
  // Rocks on the sand ring and lower grass.
  { lat: 19, long: 60, kind: 'rock', scale: 1.2 },
  { lat: 17, long: 132, kind: 'rock', scale: 1 },
  { lat: 22, long: 148, kind: 'rock', scale: 1.4 }, // near the TV, per the map
  { lat: 20, long: 262, kind: 'rock', scale: 1.1 },
  { lat: 26, long: 315, kind: 'rock', scale: 0.9 },
  // Shells on the sand (decor only, no blockers).
  { lat: 18, long: 30, kind: 'shell', scale: 1 },
  { lat: 16.5, long: 95, kind: 'shell', scale: 0.8 },
  { lat: 19, long: 168, kind: 'shell', scale: 1 },
  { lat: 17, long: 228, kind: 'shell', scale: 0.9 },
  { lat: 18.5, long: 296, kind: 'shell', scale: 1.1 },
]

/** Landmark obstacles from the map table (shells don't block). */
const landmarkBlockers: { lat: number; long: number; radius: number }[] = [
  { lat: MAP.campfire.lat, long: MAP.campfire.long, radius: 1.0 },
  { lat: MAP.bench.lat, long: MAP.bench.long, radius: 0.9 },
  { lat: MAP.tree.lat, long: MAP.tree.long, radius: 1.6 },
  { lat: MAP.palapa.lat, long: MAP.palapa.long - 2, radius: 1.2 }, // desk
  { lat: MAP.tv.lat, long: MAP.tv.long + 0.8, radius: 0.9 }, // crate
  { lat: MAP.mailbox.lat, long: MAP.mailbox.long, radius: 0.5 },
  { lat: MAP.rowboat.lat, long: MAP.rowboat.long, radius: 1.6 },
]

export const blockers: Blocker[] = [
  ...scatterProps
    .filter((p) => p.kind !== 'shell')
    .map((p) => ({
      unit: latLongToUnit(p.lat, p.long),
      radius: p.kind === 'palm' ? 1.0 : 1.4 * p.scale,
    })),
  ...landmarkBlockers.map((b) => ({
    unit: latLongToUnit(b.lat, b.long),
    radius: b.radius,
  })),
]
