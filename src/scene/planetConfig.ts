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

/** Footstep tuning (3C): gains, foot-plant phases in the swing cycle,
 * and the jump double-tap gap. */
export const FOOTSTEPS = {
  stepGainWalk: 0.5,
  stepGainSprint: 0.72,
  /** Swing-cycle phase offsets (rad) where each foot plants. */
  plantPhases: [Math.PI / 2, (3 * Math.PI) / 2],
  /** Gap between the two taps of Aiden's jump/landing double-tap. */
  jumpTapGapMs: 90,
} as const

export type Surface = 'grass' | 'sand' | 'dock' | 'wade'

/** Analytic band underfoot (3C footsteps): wade (live waterline) wins,
 * then the dock strip (meters off the dock meridian at this polar),
 * then grass vs sand split just past the plateau edge. The same
 * analytic sources as groundHeightAt — feet and ears agree. */
export function surfaceUnderfoot(polarDeg: number, longDeg: number, wet: boolean): Surface {
  if (wet) return 'wade'
  const lat = 90 - polarDeg
  if (lat >= DOCK.latMinDeg && lat <= DOCK.latMaxDeg) {
    const dLongRad = THREE_DEG * Math.abs(((longDeg - DOCK.longDeg + 540) % 360) - 180)
    const offM = PLANET_RADIUS * Math.sin(polarDeg * THREE_DEG) * Math.sin(dLongRad)
    if (Math.abs(offM) <= DOCK.halfWidthM + 0.2) return 'dock'
  }
  return polarDeg <= TERRAIN.plateauEndDeg + 2 ? 'grass' : 'sand'
}
const THREE_DEG = Math.PI / 180

/** World map placements (lat, long) — CLAUDE.md v3 table. */
export const MAP = {
  tripod: { lat: 14, long: 0 }, // Photos — on the dock end, over water
  mailbox: { lat: 24, long: 6 }, // Contact — dock entrance
  // NPC — seat ON the dock's west edge (cross-track ~0.87 m < the 1 m
  // half-width, so his butt overlaps the deck), legs over the surf.
  // 358.7 hovered his center 0.19 m PAST the edge — the floating bug.
  ukulelePlayer: { lat: 18, long: 359.05 },
  palapa: { lat: 40, long: 40 }, // Projects — day-leaning side
  bulletinBoard: { lat: 45, long: 343 }, // Papers — grass, sunset side, inland from the mailbox
  matrixPortal: { lat: 32, long: 97 }, // Build log room — just past the terminator
  cemetery: { lat: 47, long: 107 }, // Memorial garden — just past the terminator, night-leaning
  hedgeStone: { lat: 50, long: 300 }, // About — the moai in its hedge clearing, dusk boundary west
  campfire: { lat: 22, long: 180 }, // night beach
  // Log circle: three sittable logs ~3.2 m from the fire on the landward
  // arc, opening toward the sea (campfire polish 3: pushed out from
  // 2.2 m and the flank bearings widened to ±65° so the ends never
  // touch — clear walkable gaps between logs, and a full lap fits
  // between the log blockers (2.3 m inner edge) and the fire blocker
  // (1.2 m). Center log perpendicular to the fire→sea meridian; flanks
  // turned just inside tangent so the circle still opens to the sea.
  logs: [
    { lat: 25.3, long: 180, yaw: 0 },
    { lat: 23.4, long: 176.7, yaw: 0.95 },
    { lat: 23.4, long: 183.3, yaw: -0.95 },
  ],
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
 * Celestial arc (v3.7): disc elevation is DYNAMIC — a smooth function of
 * the player's polar angle from island center. High in the sky inland,
 * easing down across the beach band to hover just above the sea at the
 * waterline. The elevation rule + meridian solve live in useSkyState; this
 * config owns the endpoints and the arc↔elevation geometry.
 */
export const CELESTIAL_ELEVATION_INLAND_DEG = 45
/** v3.8 TRUE SET: elevations are horizontal-relative; the sea horizon sits
 * at ≈ −16.6° from eye height. −15.8° puts the disc center 0.75° above the
 * sea line → ~40% of the sun disc (3.7° radius) submerged at the waterline;
 * the ocean geometry physically occludes the rest. */
export const CELESTIAL_ELEVATION_WATERLINE_DEG = -15.8
/** v3.9 set floor: wading sinks it only slightly more, clamped so NEITHER
 * disc ever exceeds ~45% submerged (sun ρ 3.7° → 44%; moon ρ 2.74° → 43%)
 * — the disc and its glitter lane stay clearly visible at full set. */
export const CELESTIAL_ELEVATION_WADING_MIN_DEG = -16.2
export const CELESTIAL = { sunLongDeg: 0, moonLongDeg: 180 } as const

/** Glitter corridor tuning (v3.14): the corridor centerline is the great
 * circle from the disc's base through the character; half-widths are
 * perpendicular arc METERS (an azimuth cone pinches to a point at the
 * viewer's nadir — banned). Endpoint widths derive from the disc's
 * apparent width at reference distances: the limb distance (far) and
 * `nearRefM` (near, held at the shore). Rising scales both endpoints up
 * and eases opacity down to a floor; submergence is the only kill. */
export const GLITTER = {
  /** Corridor width at the disc base, in apparent disc widths. */
  farWidthDisc: 0.65,
  /** Corridor width held at the shoreline, in apparent disc widths… */
  nearWidthDisc: 3.75,
  /** …as seen from this reference distance (m) — the near width is a
   * stable physical width, not a per-frame shore solve. */
  nearRefM: 3,
  /** Both endpoint widths scale up to this at inland-high. */
  highWidthScale: 1.8,
  /** Lane opacity at set (the vivid column)… */
  opacityLow: 0.95,
  /** …easing down to this floor at inland-high — never invisible. */
  opacityFloor: 0.45,
  /** Elevation range (deg above the limb) easing set → inland-high. */
  elevLowDeg: 0,
  elevHighDeg: 35,
  /** Edge wobble amplitude as a fraction of local width — must stay ≪
   * the far→near width step so monotonicity survives the wobble. */
  wobbleAmp: 0.12,
} as const

const sstep = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Corridor half-widths + opacity for one body. `discAngRadRad` is the
 * disc's angular RADIUS in radians. The FAR end is ANGULAR (radians —
 * the shader multiplies by each fragment's eye distance, so the corridor
 * always matches the disc's apparent width at the water it crosses,
 * shore or inland vantage); the NEAR end is METERS (held at the shore —
 * an angular near end would pinch to a point at the viewer's nadir).
 * The submergence gate rides along: opacity × smoothstep(visibleFrac
 * 0→0.5). */
export function laneParams(
  elevAboveLimbDeg: number,
  discAngRadRad: number,
  visibleFrac: number,
) {
  const t = sstep(elevAboveLimbDeg, GLITTER.elevLowDeg, GLITTER.elevHighDeg)
  const scale = 1 + (GLITTER.highWidthScale - 1) * t
  return {
    halfFarRad: GLITTER.farWidthDisc * discAngRadRad * scale,
    halfNearM: GLITTER.nearWidthDisc * discAngRadRad * GLITTER.nearRefM * scale,
    opacity:
      (GLITTER.opacityLow + (GLITTER.opacityFloor - GLITTER.opacityLow) * t) *
      sstep(visibleFrac, 0, 0.5),
  }
}
/** The solved disc polar angle is clamped to the home side: never higher
 * than this (keeps the far side's body below the horizon under world
 * rotation), never lower than the set anchor. */
export const DISC_POLAR_MIN_DEG = 45
export const DISC_POLAR_MAX_DEG = 170

/** Must match CelestialDome's BODY_R (discs sit just inside the dome). */
const DOME_BODY_R = 230
const EYE_R = PLANET_RADIUS + 2.4

/** Apparent elevation (deg) of a dome body `arc` radians from the viewer. */
export function apparentElevationDeg(arcRad: number): number {
  return THREE.MathUtils.radToDeg(
    Math.atan2(DOME_BODY_R * Math.cos(arcRad) - EYE_R, DOME_BODY_R * Math.sin(arcRad)),
  )
}

/** Inverse of apparentElevationDeg via a monotone lookup (built once). */
const ARC_STEP = 0.5
const ARC_MIN = 20
const ARC_MAX = 175
const ARC_TABLE: number[] = []
for (let d = ARC_MIN; d <= ARC_MAX; d += ARC_STEP) {
  ARC_TABLE.push(apparentElevationDeg(THREE.MathUtils.degToRad(d)))
}
export function arcForElevationDeg(elevDeg: number): number {
  // Elevation decreases monotonically with arc — scan for the crossing.
  for (let i = 1; i < ARC_TABLE.length; i++) {
    if (ARC_TABLE[i] <= elevDeg) {
      const f = (ARC_TABLE[i - 1] - elevDeg) / (ARC_TABLE[i - 1] - ARC_TABLE[i] || 1)
      return ARC_MIN + (i - 1 + f) * ARC_STEP
    }
  }
  return ARC_MAX
}

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
  // You can never walk over the fire (slide-along like every blocker).
  { lat: MAP.campfire.lat, long: MAP.campfire.long, radius: 1.2 },
  // …or through Koa.
  { lat: MAP.ukulelePlayer.lat, long: MAP.ukulelePlayer.long, radius: 0.7 },
  // The three fire logs (sit entry bypasses the target log's blocker).
  ...MAP.logs.map((l) => ({ lat: l.lat, long: l.long, radius: 0.9 })),
  // Memorial garden wall (TASK 3): blockers TRACE the visible wall ring
  // (r 3.2 m; lesson from the moai — colliders must trace something the
  // player can SEE) leaving the northern gate open; two gate posts.
  // 1° lat ≈ 0.96 m; 1° long ≈ 0.70 m at lat 47.
  ...[72, 126, 180, 234, 288].map((bearingDeg) => {
    const b = (bearingDeg * Math.PI) / 180
    return {
      lat: MAP.cemetery.lat + (Math.cos(b) * 3.2) / 0.96,
      long: MAP.cemetery.long + (Math.sin(b) * 3.2) / 0.7,
      radius: 1.15,
    }
  }),
  { lat: MAP.cemetery.lat + 3.1 / 0.96, long: MAP.cemetery.long - 1.05 / 0.7, radius: 0.35 },
  { lat: MAP.cemetery.lat + 3.1 / 0.96, long: MAP.cemetery.long + 1.05 / 0.7, radius: 0.35 },
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
