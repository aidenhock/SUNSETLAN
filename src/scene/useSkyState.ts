import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { latLongToUnit, poleInPlanetSpace } from '../controls/planetMath'
import { CELESTIAL } from './planetConfig'
import { paletteMaterial, PROP_COLORS } from './props'

/**
 * The two-skies state (CLAUDE.md 3B, v3.2 rules). One place, per frame:
 * compute nightMix from the planet quaternion, publish the sun/moon world
 * directions, and lerp fog + background (always the CURRENT horizon stop)
 * and the whole light rig. The dome shader reads skyRuntime in its own
 * useFrame. Everything mutates in place — zero allocations per frame.
 */

/** DISC anchors (v3.3): at the waterline ~90° from their own beaches —
 * CELESTIAL in planetConfig is the single source. */
export const SUN_DISC_LOCAL = latLongToUnit(CELESTIAL.sunLatDeg, CELESTIAL.sunLongDeg)
export const MOON_DISC_LOCAL = latLongToUnit(CELESTIAL.moonLatDeg, CELESTIAL.moonLongDeg)

/** LIGHT anchors: higher than the discs — the directional light keeps a
 * flattering low-side angle; a waterline disc must never light the scene
 * from below the horizon. The dome halo only uses the azimuth (identical). */
const LIGHT_SUN_LOCAL = latLongToUnit(16, 0)
const LIGHT_MOON_LOCAL = latLongToUnit(17, 180)

/** Read-only for other systems (dome, discs, clouds, TV glow, meteors) —
 * written every frame. World unit dirs of the DISC anchors. */
export const skyRuntime = {
  nightMix: 0,
  sunWorld: SUN_DISC_LOCAL.clone(),
  moonWorld: MOON_DISC_LOCAL.clone(),
}

/** v3.2 sky stops (CLAUDE.md Two Skies — tune here, record finals). */
export const SKY = {
  dayHorizon: '#ff9e5e',
  dayMid: '#ffc98b',
  dayZenith: '#8fb8d8',
  nightHorizon: '#24304f',
  nightMid: '#141b33',
  nightZenith: '#070a14',
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
const _lightSunW = new THREE.Vector3()
const _lightMoonW = new THREE.Vector3()
const _fogDay = new THREE.Color(SKY.dayHorizon)
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

  useFrame(() => {
    const planet = planetRef.current
    if (!planet) return
    poleInPlanetSpace(planet.quaternion, _pole)
    const nightMix = nightMixFromPoleZ(_pole.z)
    skyRuntime.nightMix = nightMix
    skyRuntime.sunWorld.copy(SUN_DISC_LOCAL).applyQuaternion(planet.quaternion)
    skyRuntime.moonWorld.copy(MOON_DISC_LOCAL).applyQuaternion(planet.quaternion)

    // Fog + background = the current sky horizon stop (v3.2), so terrain
    // fade and the dome horizon always agree.
    _c.lerpColors(_fogDay, _fogNight, nightMix)
    if (scene.fog) scene.fog.color.copy(_c)
    if (scene.background instanceof THREE.Color) scene.background.copy(_c)

    const d = dir.current
    if (d) {
      d.color.lerpColors(_dirDay, _dirNight, nightMix)
      d.intensity = THREE.MathUtils.lerp(DIR_DAY_I, DIR_NIGHT_I, nightMix)
      // Light direction follows the LIGHT anchors (not the waterline
      // discs); the 0.4–0.6 blend kills the sun→moon pop.
      _lightSunW.copy(LIGHT_SUN_LOCAL).applyQuaternion(planet.quaternion)
      _lightMoonW.copy(LIGHT_MOON_LOCAL).applyQuaternion(planet.quaternion)
      _lightDir.lerpVectors(
        _lightSunW,
        _lightMoonW,
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
