import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { latLongToUnit, poleInPlanetSpace } from '../controls/planetMath'
import {
  arcForElevationDeg,
  CELESTIAL,
  CELESTIAL_ELEVATION_INLAND_DEG,
  CELESTIAL_ELEVATION_WADING_MIN_DEG,
  CELESTIAL_ELEVATION_WATERLINE_DEG,
  DISC_POLAR_MAX_DEG,
  DISC_POLAR_MIN_DEG,
  TERRAIN,
} from './planetConfig'
import { paletteMaterial, PROP_COLORS } from './props'

/**
 * The two-skies state (CLAUDE.md 3B, v3.2 rules). One place, per frame:
 * compute nightMix from the planet quaternion, publish the sun/moon world
 * directions, and lerp fog + background (always the CURRENT horizon stop)
 * and the whole light rig. The dome shader reads skyRuntime in its own
 * useFrame. Everything mutates in place — zero allocations per frame.
 */

/**
 * Celestial arc (v3.7): disc elevation follows the player — high inland,
 * setting at the shore. The solved disc polar angle lives on each body's
 * home meridian (azimuth stays 0 / 180) and is clamped to the home side,
 * so world rotation still rises and sets the bodies as you cross.
 */

/** Target apparent elevation (deg, horizontal-relative) for the player's
 * polar angle. v3.8: the descent ends in a TRUE SET at the waterline
 * (~40% submerged), sinking to the wading clamp (~55%) past it. */
export function discElevationDeg(playerPolarDeg: number): number {
  const base = THREE.MathUtils.lerp(
    CELESTIAL_ELEVATION_INLAND_DEG,
    CELESTIAL_ELEVATION_WATERLINE_DEG,
    THREE.MathUtils.smoothstep(playerPolarDeg, TERRAIN.plateauEndDeg, TERRAIN.waterlineDeg),
  )
  return THREE.MathUtils.lerp(
    base,
    CELESTIAL_ELEVATION_WADING_MIN_DEG,
    THREE.MathUtils.smoothstep(
      playerPolarDeg,
      TERRAIN.waterlineDeg,
      TERRAIN.waterlineDeg + 2.7,
    ),
  )
}

/**
 * Disc polar angle (deg from the pole, on the home meridian) whose arc to
 * the player yields the wanted elevation. py/pzMeridian are the player's
 * pole-local components in the body's meridian plane (pz sign-flipped for
 * the moon). Closed form: P·M(θ) = R·cos(θ − φ) = cos(arc).
 */
export function solveDiscPolarDeg(py: number, pzMeridian: number, arcDeg: number): number {
  const R = Math.max(Math.hypot(py, pzMeridian), 1e-4)
  const phi = Math.atan2(pzMeridian, py)
  const inner = THREE.MathUtils.clamp(Math.cos(THREE.MathUtils.degToRad(arcDeg)) / R, -1, 1)
  const theta = THREE.MathUtils.radToDeg(phi + Math.acos(inner))
  return THREE.MathUtils.clamp(theta, DISC_POLAR_MIN_DEG, DISC_POLAR_MAX_DEG)
}

/**
 * v3.10 SCREEN-SPACE SET FLOOR. The rendered framing composes the solved
 * disc dir, world rotation, and occlusion by the NEAR ocean limb as seen
 * from the actual camera — so the floor is enforced on the OUTPUT: the
 * fraction of the disc visible above the analytically computed limb.
 */
/** Ocean radius for the limb, with a wave/surf crest margin. */
const LIMB_OCEAN_R = 55.2
const DOME_BODY_R = 230
/** Disc angular radii (deg) as seen from ~dome distance. */
export const SUN_DISC_ANG_RAD_DEG = THREE.MathUtils.radToDeg(Math.atan(15 / 228))
export const MOON_DISC_ANG_RAD_DEG = THREE.MathUtils.radToDeg(Math.atan(11 / 228))
/** Minimum visible disc fraction at the shore (55–60% band). */
export const SET_VISIBLE_FLOOR = 0.575
/** The floor applies only within this longitude gate of the body's home
 * meridian — the walking-away set stays fully emergent. */
const FLOOR_GATE_RAD = THREE.MathUtils.degToRad(35)

const _discPos = new THREE.Vector3()
const _toDisc = new THREE.Vector3()
const _camUp = new THREE.Vector3()

/** Apparent elevation (deg, camera-horizontal-relative) of the dome disc
 * at polar θ on the body meridian. meridianSign: +1 sun / −1 moon.
 * camLocal is the camera position in planet-local space. */
export function discElevFromCameraDeg(
  discPolarDeg: number,
  meridianSign: 1 | -1,
  camLocal: THREE.Vector3,
): number {
  const th = THREE.MathUtils.degToRad(discPolarDeg)
  _discPos.set(0, Math.cos(th) * DOME_BODY_R, meridianSign * Math.sin(th) * DOME_BODY_R)
  _toDisc.copy(_discPos).sub(camLocal).normalize()
  _camUp.copy(camLocal).normalize()
  return THREE.MathUtils.radToDeg(
    Math.asin(THREE.MathUtils.clamp(_toDisc.dot(_camUp), -1, 1)),
  )
}

/** Ocean limb elevation (deg) from a camera at distance d from center:
 * the sphere-tangent direction. Analytic — no raycasts. */
export function limbElevationDeg(camDist: number): number {
  return (
    THREE.MathUtils.radToDeg(Math.asin(Math.min(LIMB_OCEAN_R / Math.max(camDist, LIMB_OCEAN_R), 1))) - 90
  )
}

/** Raise the disc (shrink θ) until its visible fraction above the limb
 * meets SET_VISIBLE_FLOOR — monotone bisection, runs only on violation. */
export function floorDiscPolarDeg(
  theta0: number,
  meridianSign: 1 | -1,
  camLocal: THREE.Vector3,
  discAngRadDeg: number,
): number {
  const cFloor =
    limbElevationDeg(camLocal.length()) + (2 * SET_VISIBLE_FLOOR - 1) * discAngRadDeg
  if (discElevFromCameraDeg(theta0, meridianSign, camLocal) >= cFloor) return theta0
  let lo = DISC_POLAR_MIN_DEG
  let hi = theta0
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2
    if (discElevFromCameraDeg(mid, meridianSign, camLocal) >= cFloor) lo = mid
    else hi = mid
  }
  return lo
}

const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** Spawn-time defaults (player at the pole): E = inland elevation. */
const SPAWN_ARC = arcForElevationDeg(CELESTIAL_ELEVATION_INLAND_DEG)
const SUN_HOME_LOCAL = latLongToUnit(90 - solveDiscPolarDeg(1, 0, SPAWN_ARC), CELESTIAL.sunLongDeg)
const MOON_HOME_LOCAL = latLongToUnit(90 - solveDiscPolarDeg(1, 0, SPAWN_ARC), CELESTIAL.moonLongDeg)

/** Read-only for other systems (dome, discs, water, clouds, TV glow,
 * meteors) — written every frame. Planet-LOCAL and WORLD unit dirs of the
 * dynamic disc anchors. */
export const skyRuntime = {
  nightMix: 0,
  sunLocal: SUN_HOME_LOCAL.clone(),
  moonLocal: MOON_HOME_LOCAL.clone(),
  sunWorld: SUN_HOME_LOCAL.clone(),
  moonWorld: MOON_HOME_LOCAL.clone(),
  /** Apparent elevation of each disc ABOVE the ocean limb (deg), from the
   * live camera — eases the glitter intensity. Inherits the arc smoothing
   * via the smoothed disc solve. */
  sunElevAboveLimbDeg: 45,
  moonElevAboveLimbDeg: 45,
  /** Visible fraction of each disc above the limb (0..1) — the glitter's
   * submergence gate (v3.12). */
  sunVisibleFrac: 1,
  moonVisibleFrac: 1,
}

/** v3.5 directional sky tokens. Base layer is elevation-only blues; the
 * sunset/moon layers are azimuth-shaped in the dome shader. Fog carries a
 * warm tint so the sea fade meets the sun-side horizon without a seam. */
export const SKY = {
  // Base layer (elevation-only) — v3.8: REAL sky blues, no pale bottom;
  // the raised saturation clamp + skycheck thresholds guard the floor.
  dayZenith: '#4c8bd8',
  dayMid: '#6ca7e2',
  dayHorizon: '#8fc2ec', // unmistakably blue at the horizon
  antiHaze: '#6f9ed8', // deeper soft blue on the anti-sun day horizon
  nightHorizon: '#24304f',
  nightLow: '#1a2340',
  nightMid: '#10182e',
  nightZenith: '#070a14',
  // Sunset layer (piled at the horizon around the sun)
  sunsetDeep: '#ff7a33',
  sunsetGold: '#ffc861',
  sunsetPink: '#e893b8',
  /** Saturated bridge tone: the sunset→blue blend routes through this so
   * warm-into-blue never passes through gray (v3.6 blend hazard rule). */
  sunsetBridge: '#f4a5b2',
  // Moon layer
  moonLayer: '#aebcd8',
  fogDay: '#8fc2ec', // v3.8: matches the day horizon stop exactly
  wayfind: '#31456b',
  dirDay: '#ffd9a0',
  dirNight: '#9fb4ff', // moonlight token
  hemiSkyDay: '#fff3d6',
  hemiSkyNight: '#2b3355',
  hemiGroundDay: '#e0c9a0',
  hemiGroundNight: '#1c2438',
} as const

/**
 * nightMix from the pole's planet-local z — its projection on the sunward
 * (long-0) axis. This is the robust form of the spec's "angular distance from
 * the long-0 meridian": monotone with it along any walk between the two
 * moods, but stable at the spawn pole (where longitude is undefined) and it
 * correctly separates the east/west terminator (z ≈ 0, stays dusk-warm) from
 * the true night side (z < 0).
 */
export function nightMixFromPoleZ(z: number): number {
  return 1 - THREE.MathUtils.smoothstep(z, -0.72, 0.18)
}

const DIR_DAY_I = 1.15
const DIR_NIGHT_I = 0.55
const HEMI_DAY_I = 0.55
const HEMI_NIGHT_I = 0.4
const AMB_DAY_I = 0.35
const AMB_NIGHT_I = 0.26
/** Campfire flame emissive ramps with night (v3.2: emissives scale). */
const FLAME_DAY = 0.45
const FLAME_NIGHT = 1.1

// Frame-loop scratch.
const _pole = new THREE.Vector3()
const _lightDir = new THREE.Vector3()
const _camLocal = new THREE.Vector3()
const _qInvPlanet = new THREE.Quaternion()
const _discSmooth = {
  sun: solveDiscPolarDeg(1, 0, SPAWN_ARC),
  moon: solveDiscPolarDeg(1, 0, SPAWN_ARC),
}
const _fogDay = new THREE.Color(SKY.fogDay)
const _fogNight = new THREE.Color(SKY.nightHorizon)
const _dirDay = new THREE.Color(SKY.dirDay)
const _dirNight = new THREE.Color(SKY.dirNight)
const _hemiSkyDay = new THREE.Color(SKY.hemiSkyDay)
const _hemiSkyNight = new THREE.Color(SKY.hemiSkyNight)
const _hemiGroundDay = new THREE.Color(SKY.hemiGroundDay)
const _hemiGroundNight = new THREE.Color(SKY.hemiGroundNight)
const _c = new THREE.Color()
const _flameMat = paletteMaterial(PROP_COLORS.flame, PROP_COLORS.ember, 0.85)

export function useSkyState({
  planetRef,
  hemi,
  dir,
  amb,
}: {
  planetRef: React.RefObject<THREE.Group | null>
  hemi: React.RefObject<THREE.HemisphereLight | null>
  dir: React.RefObject<THREE.DirectionalLight | null>
  amb: React.RefObject<THREE.AmbientLight | null>
}) {
  const { scene, camera } = useThree()

  useFrame((_state, dt) => {
    const planet = planetRef.current
    if (!planet) return
    poleInPlanetSpace(planet.quaternion, _pole)
    const nightMix = nightMixFromPoleZ(_pole.z)
    skyRuntime.nightMix = nightMix

    // Celestial arc (v3.7): elevation follows shore proximity, smoothed
    // ~0.6 s so the sun sinks with you. Solved on each home meridian.
    const playerPolarDeg = THREE.MathUtils.radToDeg(
      Math.acos(THREE.MathUtils.clamp(_pole.y, -1, 1)),
    )
    const arcDeg = arcForElevationDeg(discElevationDeg(playerPolarDeg))
    let sunTarget = solveDiscPolarDeg(_pole.y, _pole.z, arcDeg)
    let moonTarget = solveDiscPolarDeg(_pole.y, -_pole.z, arcDeg)
    // v3.10 screen-space set floor: within ±35° of a body's meridian,
    // correct its solve so ≥ SET_VISIBLE_FLOOR of the disc stays above the
    // camera's actual ocean limb. Off-meridian, the set stays emergent.
    _camLocal
      .copy(camera.position)
      .applyQuaternion(_qInvPlanet.copy(planet.quaternion).invert())
    const lambda = Math.atan2(_pole.x, _pole.z)
    if (Math.abs(wrapPi(lambda)) <= FLOOR_GATE_RAD) {
      sunTarget = floorDiscPolarDeg(sunTarget, 1, _camLocal, SUN_DISC_ANG_RAD_DEG)
    }
    if (Math.abs(wrapPi(lambda - Math.PI)) <= FLOOR_GATE_RAD) {
      moonTarget = floorDiscPolarDeg(moonTarget, -1, _camLocal, MOON_DISC_ANG_RAD_DEG)
    }
    const k = 1 - Math.exp(-dt / 0.6)
    _discSmooth.sun += (sunTarget - _discSmooth.sun) * k
    _discSmooth.moon += (moonTarget - _discSmooth.moon) * k
    const sunTh = THREE.MathUtils.degToRad(_discSmooth.sun)
    const moonTh = THREE.MathUtils.degToRad(_discSmooth.moon)
    skyRuntime.sunLocal.set(0, Math.cos(sunTh), Math.sin(sunTh))
    skyRuntime.moonLocal.set(0, Math.cos(moonTh), -Math.sin(moonTh))
    skyRuntime.sunWorld.copy(skyRuntime.sunLocal).applyQuaternion(planet.quaternion)
    skyRuntime.moonWorld.copy(skyRuntime.moonLocal).applyQuaternion(planet.quaternion)
    const limbDeg = limbElevationDeg(_camLocal.length())
    skyRuntime.sunElevAboveLimbDeg =
      discElevFromCameraDeg(_discSmooth.sun, 1, _camLocal) - limbDeg
    skyRuntime.moonElevAboveLimbDeg =
      discElevFromCameraDeg(_discSmooth.moon, -1, _camLocal) - limbDeg
    skyRuntime.sunVisibleFrac = THREE.MathUtils.clamp(
      (skyRuntime.sunElevAboveLimbDeg + SUN_DISC_ANG_RAD_DEG) / (2 * SUN_DISC_ANG_RAD_DEG),
      0,
      1,
    )
    skyRuntime.moonVisibleFrac = THREE.MathUtils.clamp(
      (skyRuntime.moonElevAboveLimbDeg + MOON_DISC_ANG_RAD_DEG) / (2 * MOON_DISC_ANG_RAD_DEG),
      0,
      1,
    )

    // Fog + background = the current sky horizon stop (v3.2), so terrain
    // fade and the dome horizon always agree.
    _c.lerpColors(_fogDay, _fogNight, nightMix)
    if (scene.fog) scene.fog.color.copy(_c)
    if (scene.background instanceof THREE.Color) scene.background.copy(_c)

    const d = dir.current
    if (d) {
      d.color.lerpColors(_dirDay, _dirNight, nightMix)
      d.intensity = THREE.MathUtils.lerp(DIR_DAY_I, DIR_NIGHT_I, nightMix)
      // Light direction follows the dynamic discs (v3.7 — on the active
      // side the arc keeps the disc ≥ the waterline elevation, so the
      // scene is never lit from below); the 0.4–0.6 blend kills the
      // sun→moon pop.
      _lightDir.lerpVectors(
        skyRuntime.sunWorld,
        skyRuntime.moonWorld,
        THREE.MathUtils.smoothstep(nightMix, 0.4, 0.6),
      )
      if (_lightDir.lengthSq() > 1e-4) {
        d.position.copy(_lightDir.normalize().multiplyScalar(100))
      }
    }
    const h = hemi.current
    if (h) {
      h.color.lerpColors(_hemiSkyDay, _hemiSkyNight, nightMix)
      h.groundColor.lerpColors(_hemiGroundDay, _hemiGroundNight, nightMix)
      h.intensity = THREE.MathUtils.lerp(HEMI_DAY_I, HEMI_NIGHT_I, nightMix)
    }
    const a = amb.current
    if (a) a.intensity = THREE.MathUtils.lerp(AMB_DAY_I, AMB_NIGHT_I, nightMix)

    _flameMat.emissiveIntensity = THREE.MathUtils.lerp(FLAME_DAY, FLAME_NIGHT, nightMix)
  })
}
