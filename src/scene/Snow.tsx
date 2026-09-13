import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mulberry32 } from '../audio/procedural'
import { useStore } from '../store/useStore'
import { latLongToUnit } from '../controls/planetMath'
import { windDirAt } from './wind'
import { PLANET_RADIUS, SOUTH, terrainProfile } from './planetConfig'
import { skyRuntime } from './useSkyState'

/**
 * Falling snow over Antarctica — ONE pooled THREE.Points cloud, the
 * campfire embers' technique turned cold: a pre-allocated position
 * attribute rewritten in place every frame, never re-created, never
 * re-allocated (Fire.tsx is the authority).
 *
 * The group is anchored AT the south pole with local +y pointing
 * outward, so the flakes live in a plain 26 m × 18 m cylinder and fall
 * straight down −y. That frame is planet-local, so the weather rotates
 * with the world like everything else down here. The floor each flake
 * wraps at follows the sphere falling away from the pole's tangent
 * plane PLUS the terrain profile, so flakes out near the shelf land on
 * the shelf rather than vanishing in mid-air.
 *
 * Lateral drift comes from the one global wind (`windDirAt`, wind.ts) —
 * the same wind the clouds and the campfire's ash ride — expressed in
 * this frame once at mount, with a gentle per-flake sway on top.
 *
 * One draw call, `visible = southMix > 0.05`, and no per-frame work at
 * all anywhere near the island.
 */

const FULL_COUNT = 500
const LOW_COUNT = 220
/** The cylinder the flakes live in, above the plateau. */
const RADIUS_M = 26
const HEIGHT_M = 18
const FALL_MIN = 0.9
const FALL_MAX = 1.4
/** Wind strength for the lateral drift, m/s. */
const DRIFT_MPS = 0.55

/**
 * Ground height in the pole frame at horizontal distance `r` from the
 * pole: the sphere's own drop away from the tangent plane, plus however
 * far the terrain profile sits below the plateau out there.
 */
function poleFrameFloor(r: number): number {
  const polarFromPole = r / PLANET_RADIUS
  const drop = PLANET_RADIUS * (Math.cos(polarFromPole) - 1)
  return drop + (terrainProfile(Math.PI - polarFromPole) - SOUTH.snowAltitude)
}

export function Snow() {
  const points = useRef<THREE.Points>(null)

  const { geo, mat, fall, sway, drift, rng } = useMemo(() => {
    const rng = mulberry32(0x5c0f1a)
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(FULL_COUNT * 3)
    const fallSpeed = new Float32Array(FULL_COUNT)
    const swayPhase = new Float32Array(FULL_COUNT)
    for (let i = 0; i < FULL_COUNT; i++) {
      const a = rng() * Math.PI * 2
      const r = Math.sqrt(rng()) * RADIUS_M
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 1] = poleFrameFloor(r) + rng() * HEIGHT_M
      pos[i * 3 + 2] = Math.sin(a) * r
      fallSpeed[i] = FALL_MIN + rng() * (FALL_MAX - FALL_MIN)
      swayPhase[i] = rng() * Math.PI * 2
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    // Manual bounds: the pool is a fixed cylinder, so the auto-computed
    // sphere would only ever be recomputed for nothing.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, HEIGHT_M / 2, 0), RADIUS_M + HEIGHT_M)
    const m = new THREE.PointsMaterial({
      size: 0.13,
      sizeAttenuation: true,
      color: '#ffffff',
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      toneMapped: false,
    })
    // THE wind, brought into the pole frame: the global drift direction
    // at the south pole, whose y component is zero by construction (it
    // is a tangent), read as this frame's horizontal drift.
    const southUnit = latLongToUnit(-90, 0)
    const w = windDirAt(southUnit, new THREE.Vector3())
    // In the pole frame local +y is `southUnit`; the tangent's x/z fall
    // out of the same basis the group's rotation establishes.
    const driftVec = new THREE.Vector2(w.x, -w.z).normalize().multiplyScalar(DRIFT_MPS)
    return { geo: g, mat: m, fall: fallSpeed, sway: swayPhase, drift: driftVec, rng }
  }, [])

  useFrame((state, rawDt) => {
    const p = points.current
    if (!p) return
    if (skyRuntime.southMix < 0.05) {
      p.visible = false
      return
    }
    p.visible = true
    const dt = Math.min(rawDt, 0.1) // resumed tabs hand the gap to frame 1
    const t = state.clock.elapsedTime
    const count = useStore.getState().qualityTier === 'low' ? LOW_COUNT : FULL_COUNT
    geo.setDrawRange(0, count)

    const attr = geo.attributes.position as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    for (let i = 0; i < count; i++) {
      const ix = i * 3
      const swayX = Math.sin(t * 0.7 + sway[i]) * 0.22
      const swayZ = Math.cos(t * 0.53 + sway[i] * 1.7) * 0.22
      arr[ix] += (drift.x + swayX) * dt
      arr[ix + 1] -= fall[i] * dt
      arr[ix + 2] += (drift.y + swayZ) * dt
      const r = Math.hypot(arr[ix], arr[ix + 2])
      if (arr[ix + 1] < poleFrameFloor(Math.min(r, RADIUS_M)) + 0.1 || r > RADIUS_M) {
        // Landed, or blown out of the column: back to the top at a fresh
        // spot. The generator was built at mount, so this costs a couple
        // of multiplies and allocates nothing.
        const a = rng() * Math.PI * 2
        const nr = Math.sqrt(rng()) * RADIUS_M
        arr[ix] = Math.cos(a) * nr
        arr[ix + 1] = poleFrameFloor(nr) + HEIGHT_M * (0.6 + rng() * 0.4)
        arr[ix + 2] = Math.sin(a) * nr
      }
    }
    attr.needsUpdate = true
  })

  return (
    // Anchored at the south pole, local +y pointing outward: rotating π
    // about x maps +y → −y (the pole's own outward direction) and keeps
    // the frame right-handed.
    <group position={[0, -(PLANET_RADIUS + SOUTH.snowAltitude), 0]} rotation-x={Math.PI}>
      <points ref={points} geometry={geo} material={mat} renderOrder={2} frustumCulled={false} />
    </group>
  )
}
