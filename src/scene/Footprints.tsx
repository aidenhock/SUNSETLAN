import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { controlsRuntime } from '../controls/usePlanetController'

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
 *
 * The material is LAMBERT so prints take the scene's light — at full
 * brightness they read as stickers on the night-side sand.
 */

const POOL = 28
const LIFE_S = 9
/**
 * Sized off the actual shoe (BlockyCharacter: shoeR = legR × 1.5, scaled
 * (1, 0.6, 1.3) — about 0.135 wide by 0.176 long), then trimmed a little
 * because a print is the contact patch, not the whole shoe. The first
 * pass was roughly double this and read as a trail of surfboards.
 */
const PRINT_W = 0.12
const PRINT_L = 0.17
/** Left/right offset from the walking line: half the stance width. */
const STRIDE_HALF_M = 0.075

const DAMP = new THREE.Color('#b09565') // pressed sand: a real shadow in the dip
const WET = new THREE.Color('#8f7850')
const SAND = new THREE.Color('#e8d5a3') // what it fades back to

const _m = new THREE.Matrix4()
const _sideStep = new THREE.Matrix4()
const _toLocal = new THREE.Matrix4()
const _invPlanet = new THREE.Quaternion()
const _q = new THREE.Quaternion()
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

/**
 * The print's shape, exported so its dimensions can be asserted: this
 * geometry shipped a metre long because the wrong axis was scaled, and
 * nothing but a measurement catches that.
 */
export function footprintGeometry(): THREE.BufferGeometry {

    // An oval, not a square: at this size the silhouette is the only
    // thing that says "foot", and a rectangle reads as a dropped tile.
    //
    // CircleGeometry is built in the XY plane, so its LENGTH axis is y
    // until it's laid flat. Scaling z instead did nothing to the shape
    // and left y at its full unit diameter — a metre-long dash, which is
    // exactly what shipped.
    const g = new THREE.CircleGeometry(0.5, 14)
    g.scale(PRINT_W, PRINT_L, 1)
    g.rotateX(-Math.PI / 2)
    return g
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

  const geo = useMemo(() => footprintGeometry(), [])



  useFrame((_state, rawDt) => {
    const mesh = meshRef.current
    if (!mesh) return
    const dt = Math.min(rawDt, 0.1)

    // Press whatever the gait asked for since the last frame.
    while (footprintQueue.pending > 0) {
      footprintQueue.pending--
      const lat = 90 - controlsRuntime.surfPolarDeg
      // Sand only: grass springs back, the dock is wood, and a print in
      // the sea is nonsense.
      const onSand = lat < 24.5 && lat > 12.5
      if (!onSand || controlsRuntime.airborne) break
      const p = prints[next.current]
      next.current = (next.current + 1) % POOL

      // Build the print IN WORLD SPACE, where the avatar actually is:
      // it stands at the pole with a plain world yaw, so its heading is
      // simply rotY(avatarYaw). Then convert to planet-local so the
      // print stays on the ground as the world turns beneath it.
      //
      // The previous version composed surfaceQuaternion(unit) with that
      // yaw, but surfaceQuaternion carries an ARBITRARY twist (the whole
      // reason meridianYaw exists), so prints came out pointing any
      // which way — sideways, as often as not.
      _pos.set(0, controlsRuntime.groundY + 0.012, 0)
      _q.setFromAxisAngle(_up, controlsRuntime.avatarYaw)
      _m.compose(_pos, _q, _scale)
      // Step to the side of the walking line, alternating feet.
      _m.multiply(_sideStep.makeTranslation(STRIDE_HALF_M * footprintQueue.foot, 0, 0))
      _m.premultiply(_toLocal.makeRotationFromQuaternion(_invPlanet.copy(controlsRuntime.planetQuaternion).invert()))
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
      {/* LIT, not basic: an unlit print keeps full brightness after dark
          and glows on shaded sand like a sticker. A print is a dent in
          the ground and has to take the ground's light. */}
      <meshLambertMaterial />
    </instancedMesh>
  )
}
