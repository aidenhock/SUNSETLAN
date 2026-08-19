import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { controlsRuntime } from '../controls/usePlanetController'
import { groundAltitudeAt } from '../controls/terrain'
import { latLongToUnit, surfaceQuaternion } from '../controls/planetMath'
import { PLANET_RADIUS } from './planetConfig'

/**
 * Footprints in the sand — the cheapest "this world noticed me" there
 * is. Each foot plant on sand presses a print where you stood; the
 * prints stay put as the planet turns under you, then fade back into
 * the beach behind you.
 *
 * The fade is a COLOUR lerp toward the sand, not opacity: an opaque
 * instanced mesh needs no transparency sorting against the water or the
 * fire, and per-instance alpha isn't a thing anyway. One draw call, a
 * fixed pool, and nothing allocated per step.
 */

const POOL = 28
const LIFE_S = 9
/** Left/right offset from the walking line, metres. */
const STRIDE_HALF_M = 0.16
const PRINT_L = 0.34
const PRINT_W = 0.19

const DAMP = new THREE.Color('#b09565') // pressed sand: a real shadow in the dip
const WET = new THREE.Color('#8f7850')
const SAND = new THREE.Color('#e8d5a3') // what it fades back to

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _yawQ = new THREE.Quaternion()
const _up = new THREE.Vector3(0, 1, 0)
const _pos = new THREE.Vector3()
const _scale = new THREE.Vector3(1, 1, 1)
const _c = new THREE.Color()

interface Print {
  /** Planet-local transform, fixed once pressed. */
  matrix: THREE.Matrix4
  age: number
  wet: boolean
  live: boolean
}

/**
 * Pressed by the avatar's foot-plant (the same event that fires the
 * footstep sound), so prints land in step rather than on a timer.
 */
export const footprintQueue = {
  pending: 0,
  /** Alternates so the trail zig-zags like a real gait. */
  foot: 1 as 1 | -1,
  press() {
    this.pending++
  },
}

export function Footprints() {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const prints = useMemo<Print[]>(
    () =>
      Array.from({ length: POOL }, () => ({
        matrix: new THREE.Matrix4(),
        age: Infinity,
        wet: false,
        live: false,
      })),
    [],
  )
  const next = useRef(0)

  const geo = useMemo(() => {
    // An oval, not a square: at this size the silhouette is the only
    // thing that says "foot", and a rectangle reads as a dropped tile.
    const g = new THREE.CircleGeometry(0.5, 12)
    g.scale(PRINT_W, 1, PRINT_L)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])

  useFrame((_state, rawDt) => {
    const mesh = meshRef.current
    if (!mesh) return
    const dt = Math.min(rawDt, 0.1)

    // Press whatever the gait asked for since the last frame.
    while (footprintQueue.pending > 0) {
      footprintQueue.pending--
      const lat = 90 - controlsRuntime.surfPolarDeg
      const long = controlsRuntime.surfLongDeg
      // Sand only: grass springs back, the dock is wood, and a print in
      // the sea is nonsense.
      const onSand = lat < 24.5 && lat > 12.5
      if (!onSand || controlsRuntime.airborne) break
      const p = prints[next.current]
      next.current = (next.current + 1) % POOL

      const unit = latLongToUnit(lat, long)
      // Build the print where the avatar stands, in the avatar's facing,
      // then convert to planet-local so it stays with the ground.
      _yawQ.setFromAxisAngle(_up, controlsRuntime.avatarYaw)
      _q.copy(surfaceQuaternion(unit)).multiply(_yawQ)
      _pos
        .copy(unit)
        .multiplyScalar(PLANET_RADIUS + groundAltitudeAt(lat, long) + 0.012)
      _m.compose(_pos, _q, _scale)
      // Step to the side of the walking line, alternating feet.
      _m.multiply(
        new THREE.Matrix4().makeTranslation(STRIDE_HALF_M * footprintQueue.foot, 0, 0),
      )
      footprintQueue.foot = footprintQueue.foot === 1 ? -1 : 1
      p.matrix.copy(_m)
      p.age = 0
      p.wet = controlsRuntime.wet
      p.live = true
    }

    let any = false
    for (let i = 0; i < POOL; i++) {
      const p = prints[i]
      if (!p.live) {
        // Park retired prints at the origin, scaled to nothing.
        mesh.setMatrixAt(i, _m.makeScale(0, 0, 0))
        continue
      }
      p.age += dt
      const t = p.age / LIFE_S
      if (t >= 1) {
        p.live = false
        mesh.setMatrixAt(i, _m.makeScale(0, 0, 0))
        continue
      }
      any = true
      mesh.setMatrixAt(i, p.matrix)
      // Fade by drifting back to the beach's own colour.
      _c.copy(p.wet ? WET : DAMP).lerp(SAND, THREE.MathUtils.smoothstep(t, 0.25, 1))
      mesh.setColorAt(i, _c)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.visible = any
  })

  return (
    <instancedMesh ref={meshRef} args={[geo, undefined, POOL]} frustumCulled={false}>
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}
