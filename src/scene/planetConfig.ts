import * as THREE from 'three'
import { placement, placementPos, placementYaw, placements } from '../content/placements'
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

/**
 * ANTARCTICA (south pole): the second, smaller landmass on the antipode.
 * Same chained-smoothstep shape as the north, measured in degrees FROM
 * THE SOUTH POLE — snow plateau → shoulder → ice-shelf ramp reaching 0
 * exactly at the waterline → apron down to the same −0.9 floor. The
 * profile is therefore ONE monotone surface from pole to pole, and the
 * southern apron ends tucked under the ocean-floor sphere exactly like
 * the northern one (placement rule 4: never an exposed rim, never a
 * visible underside).
 */
export const SOUTH = {
  /** Snow plateau ends (deg from the SOUTH pole). */
  plateauEndDeg: 16,
  /** Rolling shoulder down to the ice-shelf altitude. */
  shoulderEndDeg: 18.5,
  /** Waterline: the profile crosses exactly 0 here (lat −68). */
  waterlineDeg: 22,
  /** Submerged apron ends here (lat −63), below the ocean floor. */
  apronEndDeg: 27,
  snowAltitude: 0.7,
  shelfAltitude: 0.35,
  apronAltitude: -0.9,
} as const

/** Altitude at `sp` degrees from the SOUTH pole. */
function southProfile(sp: number): number {
  if (sp <= SOUTH.plateauEndDeg) return SOUTH.snowAltitude
  if (sp <= SOUTH.shoulderEndDeg) {
    return THREE.MathUtils.lerp(
      SOUTH.snowAltitude,
      SOUTH.shelfAltitude,
      THREE.MathUtils.smoothstep(sp, SOUTH.plateauEndDeg, SOUTH.shoulderEndDeg),
    )
  }
  if (sp <= SOUTH.waterlineDeg) {
    return THREE.MathUtils.lerp(
      SOUTH.shelfAltitude,
      0,
      THREE.MathUtils.smoothstep(sp, SOUTH.shoulderEndDeg, SOUTH.waterlineDeg),
    )
  }
  if (sp <= SOUTH.apronEndDeg) {
    return THREE.MathUtils.lerp(
      0,
      SOUTH.apronAltitude,
      THREE.MathUtils.smoothstep(sp, SOUTH.waterlineDeg, SOUTH.apronEndDeg),
    )
  }
  return SOUTH.apronAltitude
}

/** Which landmass a polar angle belongs to — the split is the equator. */
export function landmassAt(polarRad: number): 'north' | 'south' {
  return polarRad <= Math.PI / 2 ? 'north' : 'south'
}

/** Distance (rad) from the landmass's OWN pole: polar in the north,
 *  π − polar in the south. Both caps measure outward from zero. */
export function polarFromOwnPole(polarRad: number): number {
  return polarRad <= Math.PI / 2 ? polarRad : Math.PI - polarRad
}

/** Antarctica's wade clamp, measured from the south pole. */
export const SOUTH_MAX_POLAR_RAD =
  THREE.MathUtils.degToRad(SOUTH.waterlineDeg) + 2.5 / PLANET_RADIUS

/** The furthest polar angle a landmass lets the player reach — the
 *  north's counts down from the pole, the south's up toward it. */
export function maxWadePolarRad(landmass: 'north' | 'south'): number {
  return landmass === 'north' ? MAX_POLAR_RAD : Math.PI - SOUTH_MAX_POLAR_RAD
}

/**
 * Island bounds, landmass-aware. A step is cancelled when it carries the
 * pole FURTHER from its landmass's own pole than that landmass allows,
 * AND further than it already was — so walking back in is always legal,
 * and someone dropped mid-ocean keeps walking toward whichever cap they
 * are heading for. Pure; vitest-pinned in both hemispheres.
 */
export function stepLeavesLandmass(polarBefore: number, polarAfter: number): boolean {
  const lm = landmassAt(polarBefore)
  const limit = polarFromOwnPole(maxWadePolarRad(lm))
  const before = polarFromOwnPole(polarBefore)
  const after = polarFromOwnPole(polarAfter)
  return after > limit && after > before
}

/** Altitude above sea level at a polar angle (radians from the pole).
 *  Covers polar 0..180: the north island up to 90°, Antarctica mirrored
 *  past it, and the flat −0.9 apron floor in between (81° → 153°). */
export function terrainProfile(polarRad: number): number {
  const p = THREE.MathUtils.radToDeg(polarRad)
  if (p > 90) return southProfile(180 - p)
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

/**
 * Antarctica's little dock, the mirror of the north's: longitude 0,
 * entrance on the ice shelf at lat −70 and the far end out over open
 * water at lat −66 — it runs DOWN its meridian toward the sea, which in
 * the southern hemisphere means toward INCREASING latitude. It faces
 * north, back toward the island. Same strip contract: the deck rides
 * deckHeightM above the local band, consumed by both the visuals and
 * groundAltitudeAt.
 */
export const SOUTH_DOCK = {
  longDeg: 0,
  latMinDeg: -70,
  latMaxDeg: -66,
  halfWidthM: 1,
  deckHeightM: 0.6,
  plankThicknessM: 0.18,
  segmentCount: 3,
}

/**
 * The boat: moored beside a dock's far end, drives the open water.
 * Speeds are metres per second like MOVE_SPEED; the arc figures are
 * metres of arc on the sphere, like the interact and sit prompt radii.
 */
export const BOAT = {
  maxSpeedMps: 11,
  accelMps2: 5,
  decelMps2: 4,
  turnRateRadPerS: 1.7,
  /** How far off the dock meridian the boat moors (metres of arc). */
  mooringSideM: 1.7,
  /** The moored hull's walkable FOOTPRINT (metres): a rectangle centred
   *  on the mooring, the long axis along the mooring's meridian. Slightly
   *  inside the gunwale trim, so you stand on the boat and not on air. */
  hullLengthM: 3,
  hullWidthM: 1.1,
  /** "E — Board the boat" enters here, leaves at the exit radius. */
  boardArcM: 2.6,
  boardExitArcM: 3.1,
  /** "E — Tie up" shows within this arc of a dock's far end. */
  dockArcM: 4.5,
  /** Clearance the hull keeps outside either waterline. */
  shoreMarginM: 0.6,
  /** Board / tie-up quaternion tween, seconds (cf. the sit tween). */
  tweenS: 0.45,
} as const

/**
 * The boat's two heights, above ITS OWN waterline (the hull mesh's local
 * y = 0, which sits at sea level + bob). ONE place: props.ts cuts the
 * geometry from them, the controller seats the driver on them, and
 * terrain.ts walks on them — they can never disagree.
 *
 * The interior floor sits ABOVE the water's maximum live height (three
 * wave sines x 0.04 = 0.12, plus SURF.amplitudeM 0.06 = 0.18), and the
 * slab under it is thick down to the hull bottom, so no wave can ever
 * show through the floor from inside the hull.
 */
export const BOAT_DECK_M = 0.24
/** Bench / stern-seat top, same frame — where the driver sits. */
export const BOAT_SEAT_M = 0.52

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
export function surfaceUnderfoot(
  polarDeg: number,
  longDeg: number,
  wet: boolean,
  onBoatDeck = false,
): Surface {
  if (wet) return 'wade'
  // Standing in the moored boat: hollow wood, the same as the dock —
  // the hull IS a deck (terrain.ts onBoatDeck; no new audio category).
  if (onBoatDeck) return 'dock'
  const lat = 90 - polarDeg
  for (const dock of [DOCK, SOUTH_DOCK]) {
    if (lat < dock.latMinDeg || lat > dock.latMaxDeg) continue
    const dLongRad = THREE_DEG * Math.abs(((longDeg - dock.longDeg + 540) % 360) - 180)
    const offM = PLANET_RADIUS * Math.sin(polarDeg * THREE_DEG) * Math.sin(dLongRad)
    if (Math.abs(offM) <= dock.halfWidthM + 0.2) return 'dock'
  }
  // Antarctica has no sand and no grass; until a snow pool exists it
  // borrows the two existing surfaces — plateau reads as the soft one,
  // the ice shelf as the gritty one.
  if (polarDeg > 90) {
    return polarDeg >= 180 - SOUTH.plateauEndDeg ? 'grass' : 'sand'
  }
  return polarDeg <= TERRAIN.plateauEndDeg + 2 ? 'grass' : 'sand'
}
const THREE_DEG = Math.PI / 180

/** World map placements (lat, long) — CLAUDE.md v3 table. */
/**
 * The world map, DERIVED from the monument index (src/content/
 * monuments.json — the single place coordinates are edited). Keys here
 * are the names scene code already uses; move something by editing the
 * JSON, not this table.
 */
export const MAP = {
  tripod: placementPos('photos'), // Photos — on the dock end, over water
  mailbox: placementPos('contact'), // Contact — dock entrance
  // NPC — seat ON the dock's west edge (cross-track ~0.87 m < the 1 m
  // half-width, so his butt overlaps the deck), legs over the surf.
  ukulelePlayer: placementPos('koa'),
  palapa: placementPos('projects'), // Projects — day-leaning side
  bulletinBoard: placementPos('papers'), // Papers — grass, sunset side
  matrixPortal: placementPos('rift'), // Build-log room — night-leaning side
  cemetery: placementPos('cemetery'), // Memorial garden
  hedgeStone: placementPos('about'), // About — the moai, dusk boundary west
  campfire: placementPos('campfire'), // night beach
  // Log circle: three sittable logs ~3.2 m from the fire on the landward
  // arc, opening toward the sea. Yaw comes from each log's facingDeg.
  logs: [
    { ...placementPos('log-center'), yaw: placementYaw('log-center') },
    { ...placementPos('log-west'), yaw: placementYaw('log-west') },
    { ...placementPos('log-east'), yaw: placementYaw('log-east') },
  ],
  musicUkulele: placementPos('music'), // Music — by the fire
  tv: { lat: placement('videos').lat, long: placement('videos').long - 0.8 }, // Videos — the CRATE's spot; the TV sits on it
  rowboat: placementPos('rowboat'),
}

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
  return (
    Math.sin((timeS * Math.PI * 2) / SURF.periodS) *
    SURF.amplitudeM *
    surfShoreWeight(THREE.MathUtils.radToDeg(polarRad))
  )
}

/** Antarctica's beach band: the shore weighting ramps in over the 7°
 *  above its waterline, mirroring SURF.startDeg → SURF.endDeg. */
export const SURF_SOUTH_START_DEG = 180 - SOUTH.waterlineDeg - 7
export const SURF_SOUTH_END_DEG = 180 - SOUTH.waterlineDeg

/** Shore weighting of the surf cycle — ramps in across EITHER beach
 *  band. The water shader ports this expression verbatim; if the two
 *  ever disagree the foam and the wade ripple part company. */
export function surfShoreWeight(polarDeg: number): number {
  return Math.max(
    THREE.MathUtils.smoothstep(polarDeg, SURF.startDeg, SURF.endDeg),
    THREE.MathUtils.smoothstep(polarDeg, SURF_SOUTH_START_DEG, SURF_SOUTH_END_DEG),
  )
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

/**
 * Decorative scatter, DERIVED from the placement file — palms, rocks and
 * shells are placements like everything else now, and Island renders
 * them from here.
 */
export const scatterProps: ScatterProp[] = placements
  .filter((p) => p.kind === 'scatter')
  .map((p) => ({
    lat: p.lat,
    long: p.long,
    kind: p.type as ScatterProp['kind'],
    scale: p.scale,
  }))

/** Landmark obstacles from the map table (shells don't block). */
/**
 * The memorial garden's fence blockers, generated from the plot itself
 * so they follow it: blockers TRACE the visible iron-fence line (r 0.55,
 * ~1 m spacing — the moai lesson: colliders must trace something the
 * player can SEE) around all four sides of the widthM × depthM
 * rectangle, skipping the ~3 m south gate gap so the gate and the WHOLE
 * interior stay walkable. Exported because the editor regenerates it
 * whenever the cemetery placement is dragged.
 */
export function fenceBlockersFor(cem: {
  lat: number
  long: number
  size?: { widthM: number; depthM: number }
}): { lat: number; long: number; radius: number }[] {

    const hw = (cem.size?.widthM ?? 0) / 2
    const hd = (cem.size?.depthM ?? 0) / 2
    const gateHalf = 1.5
    const mPerDegLat = (Math.PI * PLANET_RADIUS) / 180
    const mPerDegLong = mPerDegLat * Math.cos((cem.lat * Math.PI) / 180)
    const spaced = (from: number, to: number, pitch = 1.0): number[] => {
      const len = to - from
      const count = Math.max(1, Math.round(len / pitch)) + 1
      return Array.from({ length: count }, (_, i) => from + (len * i) / (count - 1))
    }
    const point = (x: number, z: number) => ({
      lat: cem.lat + z / mPerDegLat,
      long: cem.long + x / mPerDegLong,
      radius: 0.55,
    })
    const out: { lat: number; long: number; radius: number }[] = []
    for (const x of spaced(-hw, hw)) out.push(point(x, hd)) // north
    for (const x of spaced(-hw, -gateHalf)) out.push(point(x, -hd)) // south, west of gate
    for (const x of spaced(gateHalf, hw)) out.push(point(x, -hd)) // south, east of gate
    for (const z of spaced(-hd, hd)) out.push(point(hw, z)) // east
    for (const z of spaced(-hd, hd)) out.push(point(-hw, z)) // west
    return out
}

const landmarkBlockers: { lat: number; long: number; radius: number }[] = [
  // Everything that collides and ISN'T an interactable: props, seats,
  // the NPC, and the scattered palms and rocks. Interactable blockers
  // are added by the controller straight from their definitions, so
  // listing them here too would only duplicate them.
  ...placements
    .filter((p) => p.kind !== 'interactable' && p.blockerRadiusM !== undefined)
    .map((p) => ({ lat: p.lat, long: p.long, radius: p.blockerRadiusM! })),
  ...fenceBlockersFor(placement('cemetery')),
]


export const blockers: Blocker[] = landmarkBlockers.map((b) => ({
  unit: latLongToUnit(b.lat, b.long),
  radius: b.radius,
}))

