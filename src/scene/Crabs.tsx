import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { play2d } from '../audio/core'
import { controlsRuntime } from '../controls/usePlanetController'
import { latLongToUnit, poleInPlanetSpace, surfaceQuaternion } from '../controls/planetMath'
import { useStore } from '../store/useStore'
import { advanceCrab, CRAB_SPEED, nextSnapDelay, type CrabState } from './crabWalk'

interface CrabLocal extends CrabState {
  nextSnapAt: number
  snapT: number
}
import { PLANET_RADIUS, terrainProfile } from './planetConfig'

/**
 * Crabs (3C): 3–4 primitive critters — body + four leg boxes each,
 * ALL crabs in ONE InstancedMesh (5 instances per crab, shared
 * material, one draw call). Sideways scuttle with leg wiggle;
 * random-walk clamped to the sand band (lat 16–23), never below the
 * LIVE waterline (surfOffset) and never onto grass; frequent pauses;
 * skitters ~1 m away when the player closes within 2 m, with a soft
 * click within earshot. qualityTier low halves the count.
 */

const CRAB_COUNT = 4
const PARTS_PER_CRAB = 5

const SPAWNS: Array<[number, number]> = [
  [20, 22],
  [18.5, 341],
  [20.5, 162],
  [19, 199],
]

export function Crabs() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const crabs = useMemo<CrabLocal[]>(
    () =>
      SPAWNS.map(([lat, long], i) => ({
        lat,
        long,
        heading: i * 1.7,
        state: 'pause' as const,
        timer: 1 + i * 0.7,
        phase: i * 2.1,
        nextSnapAt: 2 + i,
        snapT: -10,
      })),
    [],
  )
  const scratch = useMemo(
    () => ({
      o: new THREE.Object3D(),
      unit: new THREE.Vector3(),
      pole: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      yawQ: new THREE.Quaternion(),
      up: new THREE.Vector3(0, 1, 0),
    }),
    [],
  )

  useFrame((state, dt) => {
    const m = mesh.current
    if (!m) return
    const t = state.clock.elapsedTime
    const tier = useStore.getState().qualityTier
    const active = tier === 'low' ? 2 : CRAB_COUNT
    poleInPlanetSpace(controlsRuntime.planetQuaternion, scratch.pole)

    for (let c = 0; c < CRAB_COUNT; c++) {
      const crab = crabs[c]
      const visible = c < active
      if (visible) {
        scratch.unit.copy(latLongToUnit(crab.lat, crab.long))
        const arcToPlayer = scratch.unit.angleTo(scratch.pole) * PLANET_RADIUS

        // Startle: player within 2 m → skitter ~1 m directly away.
        if (crab.state !== 'skitter' && arcToPlayer < 2) {
          crab.state = 'skitter'
          crab.timer = 1 / CRAB_SPEED.skitter // ≈1 m of travel
          // Heading away from the player in lat/long space.
          const dLat = crab.lat - (90 - THREE.MathUtils.radToDeg(Math.acos(scratch.pole.y)))
          const dLong =
            ((crab.long - THREE.MathUtils.radToDeg(Math.atan2(scratch.pole.x, scratch.pole.z)) + 540) %
              360) -
            180
          crab.heading = Math.atan2(dLong, dLat)
          if (arcToPlayer < 6) void play2d('crabs', 'world', 0.165)
        }
        // Idle pincer snap (polish 2): a watched, paused crab snaps at
        // random 3–8 s intervals with a claw twitch.
        if (crab.state === 'pause' && arcToPlayer < 4 && t >= crab.nextSnapAt) {
          crab.snapT = t
          crab.nextSnapAt = t + nextSnapDelay()
          void play2d('crabs', 'world', 0.35)
          const w = window as unknown as { __snapLog?: number[] }
          ;(w.__snapLog ??= []).push(t)
          if (w.__snapLog.length > 16) w.__snapLog.shift()
        }
        advanceCrab(crab, dt, t)
      }

      // Compose the 5 part matrices (hidden crabs collapse to zero).
      const polar = THREE.MathUtils.degToRad(90 - crab.lat)
      const alt = terrainProfile(polar)
      scratch.unit.copy(latLongToUnit(crab.lat, crab.long))
      scratch.q.copy(surfaceQuaternion(scratch.unit))
      scratch.yawQ.setFromAxisAngle(scratch.up, crab.heading + Math.PI / 2) // scuttle SIDEWAYS
      scratch.q.multiply(scratch.yawQ)
      const base = scratch.unit.clone().multiplyScalar(PLANET_RADIUS + alt + 0.05)
      const wig = Math.sin(crab.phase) * (crab.state === 'pause' ? 0.06 : 0.5)
      for (let p = 0; p < PARTS_PER_CRAB; p++) {
        const idx = c * PARTS_PER_CRAB + p
        scratch.o.position.copy(base)
        scratch.o.quaternion.copy(scratch.q)
        if (!visible) {
          scratch.o.scale.setScalar(0.0001)
        } else if (p === 0) {
          scratch.o.scale.set(0.22, 0.11, 0.15)
          scratch.o.translateY(0.06 + Math.abs(wig) * 0.01)
        } else {
          const side = p < 3 ? 1 : -1
          const front = p % 2 === 0 ? 1 : -1
          // Claw twitch: front legs pop up briefly on each pincer snap.
          const sinceSnap = t - crab.snapT
          const twitch =
            front === 1 && sinceSnap >= 0 && sinceSnap < 0.3
              ? Math.sin((sinceSnap / 0.3) * Math.PI)
              : 0
          scratch.o.scale.set(0.035, 0.075 * (1 + twitch * 0.6), 0.035)
          scratch.o.translateX(side * 0.13)
          scratch.o.translateZ(front * 0.06 + side * wig * 0.02 * front)
          scratch.o.translateY(0.035 + twitch * 0.045)
        }
        scratch.o.updateMatrix()
        m.setMatrixAt(idx, scratch.o.matrix)
      }
    }
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, CRAB_COUNT * PARTS_PER_CRAB]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshLambertMaterial color="#e06a4a" />
    </instancedMesh>
  )
}
