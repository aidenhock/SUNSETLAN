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
  const { scene } = useThree()

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
    const sunTarget = solveDiscPolarDeg(_pole.y, _pole.z, arcDeg)
    const moonTarget = solveDiscPolarDeg(_pole.y, -_pole.z, arcDeg)
    const k = 1 - Math.exp(-dt / 0.6)
    _discSmooth.sun += (sunTarget - _discSmooth.sun) * k
    _discSmooth.moon += (moonTarget - _discSmooth.moon) * k
    const sunTh = THREE.MathUtils.degToRad(_discSmooth.sun)
    const moonTh = THREE.MathUtils.degToRad(_discSmooth.moon)
    skyRuntime.sunLocal.set(0, Math.cos(sunTh), Math.sin(sunTh))
    skyRuntime.moonLocal.set(0, Math.cos(moonTh), -Math.sin(moonTh))
    skyRuntime.sunWorld.copy(skyRuntime.sunLocal).applyQuaternion(planet.quaternion)
    skyRuntime.moonWorld.copy(skyRuntime.moonLocal).applyQuaternion(planet.quaternion)

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
