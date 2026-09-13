import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { controlsRuntime } from '../controls/usePlanetController'
import { poleInPlanetSpace, WORLD_UP } from '../controls/planetMath'
import { useStore } from '../store/useStore'
import {
  advancePenguin,
  penguinLat,
  startlePenguin,
  type PenguinState,
} from './penguinWalk'
import { PLANET_RADIUS, terrainProfile } from './planetConfig'
import { skyRuntime } from './useSkyState'

/**
 * Penguins (Antarctica life) — the south cap's crabs. Six of them (three
 * on qualityTier low), and ALL of them in ONE InstancedMesh: a unit cube
 * geometry, eight instances per bird, each instance coloured once at
 * mount through `instanceColor`, so the whole colony is a single draw
 * call with no per-frame material work.
 *
 * Behaviour lives in the pure kernel (`penguinWalk.ts`, vitest-pinned):
 * waddle at 0.7 m/s, pause often, turn in place, random-walk clamped to
 * polar 8°–21.5° from the south pole AND to ground above the waterline.
 * Here we only add the startle — the player inside 2.5 m sends a bird
 * into a 1.2 s hop-shuffle directly away (silent: no penguin audio pool
 * exists, and a procedural squawk is not something to invent by ear).
 *
 * Zero allocations per frame: one scratch Object3D and a handful of
 * vectors, reused. The whole system stands down (visible = false, no
 * work at all) whenever `skyRuntime.southMix` says the player is nowhere
 * near the south cap.
 */

const PENGUIN_COUNT = 6
const PARTS_PER_PENGUIN = 8
const INSTANCES = PENGUIN_COUNT * PARTS_PER_PENGUIN

/** Player distance that startles a bird, in metres of arc. */
const STARTLE_M = 2.5

/** Spawn spots as [degrees from the south pole, longitude]. The first
 *  three are the ones low tier keeps, so the shelf never empties. */
const SPAWNS: Array<[number, number]> = [
  [19.8, 148],
  [20.4, 154],
  [19.2, 158],
  [16.5, 146],
  [13.0, 60],
  [11.5, 285],
]

const DARK = '#1e2430'
const BELLY = '#f6f8fb'
const BEAK = '#ffb347'

/** Part colours, in the order the matrices are written below. */
const PART_COLORS = [DARK, BELLY, DARK, BEAK, DARK, DARK, BEAK, BEAK]

export function Penguins() {
  const mesh = useRef<THREE.InstancedMesh>(null)

  const birds = useMemo<PenguinState[]>(
    () =>
      SPAWNS.map(([sp, long], i) => ({
        sp,
        long,
        heading: i * 1.9,
        state: 'pause' as const,
        timer: 1 + i * 0.8,
        phase: i * 1.3,
      })),
    [],
  )

  const scratch = useMemo(
    () => ({
      o: new THREE.Object3D(),
      unit: new THREE.Vector3(),
      north: new THREE.Vector3(),
      pole: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      invQ: new THREE.Quaternion(),
      yawQ: new THREE.Quaternion(),
      base: new THREE.Vector3(),
    }),
    [],
  )

  useFrame((_state, rawDt) => {
    const m = mesh.current
    if (!m) return

    // Cheap visibility: over a hundred metres of planet away, the whole
    // colony is off — no matrices, no draw call.
    if (skyRuntime.southMix < 0.02) {
      m.visible = false
      return
    }
    m.visible = true

    // One-time per-instance tint (the Fire 2.0 pattern): eight colours
    // repeated per bird, written once, never touched again.
    if (!m.instanceColor) {
      const c = new THREE.Color()
      for (let i = 0; i < INSTANCES; i++) {
        m.setColorAt(i, c.set(PART_COLORS[i % PARTS_PER_PENGUIN]))
      }
      const attr = m.instanceColor as THREE.InstancedBufferAttribute | null
      if (attr) attr.needsUpdate = true
    }

    const dt = Math.min(rawDt, 0.1) // resumed tabs hand the gap to frame 1
    const tier = useStore.getState().qualityTier
    const active = tier === 'low' ? 3 : PENGUIN_COUNT
    poleInPlanetSpace(controlsRuntime.planetQuaternion, scratch.pole)
    const playerLat = 90 - THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(scratch.pole.y, -1, 1)))
    const playerLong = THREE.MathUtils.radToDeg(Math.atan2(scratch.pole.x, scratch.pole.z))

    for (let b = 0; b < PENGUIN_COUNT; b++) {
      const bird = birds[b]
      const visible = b < active
      const lat = penguinLat(bird.sp)
      const polar = THREE.MathUtils.degToRad(90 - lat)
      const sinP = Math.sin(polar)
      const cosP = Math.cos(polar)
      const lo = THREE.MathUtils.degToRad(bird.long)
      scratch.unit.set(sinP * Math.sin(lo), cosP, sinP * Math.cos(lo))

      if (visible) {
        const arc = scratch.unit.angleTo(scratch.pole) * PLANET_RADIUS
        if (bird.state !== 'hop' && arc < STARTLE_M) {
          // Bearing to the player, then straight away from it. Metres,
          // not degrees: a degree of longitude is a fifth of a degree of
          // latitude down here, and the bird would bolt sideways.
          const dNorth = playerLat - lat
          const dEast =
            (((playerLong - bird.long + 540) % 360) - 180) *
            Math.cos(THREE.MathUtils.degToRad(lat))
          startlePenguin(bird, Math.atan2(dEast, dNorth) + Math.PI)
        }
        advancePenguin(bird, dt)
      }

      // ---- compose this bird's eight part matrices --------------------
      // Surface frame: +Y is the outward normal, +Z is local north, and
      // the yaw offset is NEGATIVE heading (a positive rotation about +Y
      // swings +Z toward west in this frame — the villagers found the
      // same sign the hard way).
      scratch.q.setFromUnitVectors(WORLD_UP, scratch.unit)
      scratch.north.set(-cosP * Math.sin(lo), sinP, -cosP * Math.cos(lo))
      scratch.invQ.copy(scratch.q).invert()
      scratch.north.applyQuaternion(scratch.invQ)
      scratch.yawQ.setFromAxisAngle(WORLD_UP, Math.atan2(scratch.north.x, scratch.north.z) - bird.heading)
      scratch.q.multiply(scratch.yawQ)

      // Critters sit ON the ground (no prop sink) with a whisker of
      // clearance so the jittered facets cannot swallow their feet.
      const alt = terrainProfile(THREE.MathUtils.degToRad(90 - lat)) + 0.02
      scratch.base.copy(scratch.unit).multiplyScalar(PLANET_RADIUS + alt)

      const walking = bird.state !== 'pause'
      const rock = Math.sin(bird.phase) * (walking ? 0.12 : 0.03)
      const bob = walking ? Math.abs(Math.sin(bird.phase)) * 0.02 : 0
      const flap = 0.22 + (walking ? 0.2 : 0.05) * Math.sin(bird.phase)

      for (let p = 0; p < PARTS_PER_PENGUIN; p++) {
        const o = scratch.o
        o.position.copy(scratch.base)
        o.quaternion.copy(scratch.q)
        o.scale.set(1, 1, 1)
        if (!visible) {
          o.scale.setScalar(0.0001)
          o.updateMatrix()
          m.setMatrixAt(b * PARTS_PER_PENGUIN + p, o.matrix)
          continue
        }
        // Whole-bird waddle: roll about the travel axis, pivoting at the
        // feet (we rotate the base frame BEFORE translating up).
        o.rotateZ(rock)
        switch (p) {
          case 0: // body
            o.scale.set(0.32, 0.55, 0.3)
            o.translateY(0.335 + bob)
            break
          case 1: // white belly, inset into the chest
            o.scale.set(0.22, 0.4, 0.06)
            o.translateY(0.32 + bob)
            o.translateZ(0.152)
            break
          case 2: // head
            o.scale.set(0.24, 0.24, 0.24)
            o.translateY(0.72 + bob)
            o.translateZ(0.01)
            break
          case 3: // beak
            o.scale.set(0.07, 0.06, 0.13)
            o.translateY(0.7 + bob)
            o.translateZ(0.165)
            break
          case 4:
          case 5: {
            // Flippers: angled out from the shoulder, flapping a little.
            const side = p === 4 ? -1 : 1
            o.translateY(0.34 + bob)
            o.translateX(side * 0.185)
            o.rotateZ(side * flap)
            o.scale.set(0.05, 0.3, 0.16)
            break
          }
          default: {
            // Feet stay on the snow — no bob, no flap.
            const side = p === 6 ? -1 : 1
            o.scale.set(0.11, 0.06, 0.17)
            o.translateY(0.03)
            o.translateX(side * 0.085)
            o.translateZ(0.04)
            break
          }
        }
        o.updateMatrix()
        m.setMatrixAt(b * PARTS_PER_PENGUIN + p, o.matrix)
      }
    }
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, INSTANCES]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshLambertMaterial flatShading />
    </instancedMesh>
  )
}
