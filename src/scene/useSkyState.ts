import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { latLongToUnit, poleInPlanetSpace } from '../controls/planetMath'

/**
 * The two-skies state (CLAUDE.md 3B). One place, per frame: compute nightMix
 * from the planet quaternion and lerp fog color, background/clear color, and
 * the whole light rig (hemisphere pair, directional color/intensity/direction,
 * ambient) between the sunset and night moods. Everything mutates in place —
 * zero allocations in the frame loop.
 */

/** Planet-local anchors: sun low over the water at long 0, moon at 180.
 * Both at ~lat 16 so each hangs just over the horizon as seen from spawn
 * (and rises overhead as you walk toward it — the tiny-planet sunrise). */
export const SUN_LOCAL = latLongToUnit(16, 0)
export const MOON_LOCAL = latLongToUnit(17, 180)

/** Read-only for other systems (clouds, TV glow, meteors) — written per frame. */
export const skyRuntime = { nightMix: 0 }

export const SKY = {
  fogDay: '#ffe3bd',
  fogNight: '#1b2033', // midnight token
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
 * the true night side (z < 0). Asymmetric edges keep spawn and the terminator
 * in the warm mood; the crossfade plays out over ~long 80 → 135 of the ring.
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

// Frame-loop scratch.
const _pole = new THREE.Vector3()
const _sunW = new THREE.Vector3()
const _moonW = new THREE.Vector3()
const _lightDir = new THREE.Vector3()
const _fogDay = new THREE.Color(SKY.fogDay)
const _fogNight = new THREE.Color(SKY.fogNight)
const _dirDay = new THREE.Color(SKY.dirDay)
const _dirNight = new THREE.Color(SKY.dirNight)
const _hemiSkyDay = new THREE.Color(SKY.hemiSkyDay)
const _hemiSkyNight = new THREE.Color(SKY.hemiSkyNight)
const _hemiGroundDay = new THREE.Color(SKY.hemiGroundDay)
const _hemiGroundNight = new THREE.Color(SKY.hemiGroundNight)
const _c = new THREE.Color()

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

    // Fog + background (they must match — the dome is fog-excluded).
    _c.lerpColors(_fogDay, _fogNight, nightMix)
    if (scene.fog) scene.fog.color.copy(_c)
    if (scene.background instanceof THREE.Color) scene.background.copy(_c)

    const d = dir.current
    if (d) {
      d.color.lerpColors(_dirDay, _dirNight, nightMix)
      d.intensity = THREE.MathUtils.lerp(DIR_DAY_I, DIR_NIGHT_I, nightMix)
      // Light direction follows the sun's (moon's past the handover) WORLD
      // position under the planet quaternion; the 0.4–0.6 blend kills the pop.
      _sunW.copy(SUN_LOCAL).applyQuaternion(planet.quaternion)
      _moonW.copy(MOON_LOCAL).applyQuaternion(planet.quaternion)
      _lightDir.lerpVectors(_sunW, _moonW, THREE.MathUtils.smoothstep(nightMix, 0.4, 0.6))
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
  })
}
