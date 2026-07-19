import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { WORLD_UP } from '../controls/planetMath'
import { useStore } from '../store/useStore'
import { skyRuntime } from './useSkyState'

/**
 * Shooting stars — occasional meteor streak, night side (CLAUDE.md 3B).
 * Planet-local: mount inside the rotating planet group so streaks stay
 * welded to the night dome the same way CelestialDome's sun/moon/stars do.
 * A tiny fixed pool of meshes; each runs its own countdown/lifetime in a
 * per-streak ref so the frame loop allocates nothing in steady state.
 */

const STREAK_COUNT = 2
const SPAWN_R = 200 // just inside CelestialDome's BODY_R (230)
const TRAVEL = 35 // units crossed over the lifetime
const LIFETIME = 0.7 // seconds
const COOLDOWN_MIN = 7
const COOLDOWN_MAX = 15
const PEAK_OPACITY = 0.9

interface StreakState {
  active: boolean
  age: number
  cooldown: number
  origin: THREE.Vector3
  dir: THREE.Vector3 // travel direction, tangent to the dome at origin
}

// Module-level scratch for the activation math below — never touched inside
// the steady-state per-frame branch, only when a streak (re)spawns.
const _radial = new THREE.Vector3()
const _tangentA = new THREE.Vector3()
const _tangentB = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const AXIS_X = new THREE.Vector3(1, 0, 0)

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randomCooldown(): number {
  return randomBetween(COOLDOWN_MIN, COOLDOWN_MAX)
}

/**
 * Picks a night-sky spawn point and a tangent travel direction, writing both
 * into the streak's persistent vectors in place (no allocation).
 *
 * Spawn: unit direction with y in [0.15, 0.75] (the star scatter's upper sky
 * band) and z < -0.45 (well inside the night hemisphere, z < -0.25 per
 * CelestialDome's star cutoff). Solving x^2 + z^2 = 1 - y^2 for a random z in
 * [-radius, -0.45] and the matching x keeps the sample exactly unit-length —
 * no renormalize needed.
 */
function activateStreak(s: StreakState): void {
  const y = randomBetween(0.15, 0.75)
  const radiusXZ = Math.sqrt(Math.max(0, 1 - y * y)) // >= ~0.66 at y's max, always > 0.45
  const z = -randomBetween(0.45, radiusXZ)
  const xMag = Math.sqrt(Math.max(0, radiusXZ * radiusXZ - z * z))
  const x = Math.random() < 0.5 ? xMag : -xMag
  _radial.set(x, y, z)
  s.origin.copy(_radial).multiplyScalar(SPAWN_R)

  // Tangent basis at the spawn point; _radial is never parallel to WORLD_UP
  // since y is capped at 0.75, so the cross product below never degenerates.
  _tangentA.crossVectors(WORLD_UP, _radial).normalize()
  _tangentB.crossVectors(_radial, _tangentA)
  const theta = Math.random() * Math.PI * 2
  s.dir
    .set(0, 0, 0)
    .addScaledVector(_tangentA, Math.cos(theta))
    .addScaledVector(_tangentB, Math.sin(theta))
    .normalize()
}

export function ShootingStars() {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([])
  const streaks = useRef<StreakState[]>(
    Array.from({ length: STREAK_COUNT }, () => ({
      active: false,
      age: 0,
      // Independent random draw per streak already staggers the first fire.
      cooldown: randomCooldown(),
      origin: new THREE.Vector3(),
      dir: new THREE.Vector3(),
    })),
  )

  useFrame((_state, dt) => {
    const gated = useStore.getState().qualityTier === 'high' && skyRuntime.nightMix > 0.35
    for (let i = 0; i < STREAK_COUNT; i++) {
      const s = streaks.current[i]
      const mesh = meshRefs.current[i]
      if (!mesh) continue
      const mat = mesh.material as THREE.MeshBasicMaterial

      if (!s.active) {
        s.cooldown -= dt
        if (s.cooldown > 0 || !gated) continue
        activateStreak(s)
        mesh.quaternion.copy(_quat.setFromUnitVectors(AXIS_X, s.dir))
        s.active = true
        s.age = 0
        mesh.visible = true
      }

      s.age += dt
      if (s.age >= LIFETIME) {
        s.active = false
        s.cooldown = randomCooldown()
        mesh.visible = false
        mat.opacity = 0
        continue
      }

      const t = s.age / LIFETIME
      mesh.position.copy(s.origin).addScaledVector(s.dir, t * TRAVEL)
      mat.opacity = PEAK_OPACITY * (1 - Math.abs(2 * t - 1)) // triangle envelope
    }
  })

  return (
    <>
      {Array.from({ length: STREAK_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshRefs.current[i] = m
          }}
          visible={false}
          renderOrder={-6}
        >
          <boxGeometry args={[7, 0.12, 0.12]} />
          <meshBasicMaterial
            color="#fff3d6"
            transparent
            opacity={0}
            fog={false}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  )
}
