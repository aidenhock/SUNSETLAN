import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useStore } from '../store/useStore'
import { mulberry32 } from './geometryUtils'
import { normalizeForMerge } from './props'
import { MOON_DISC_LOCAL, skyRuntime, SUN_DISC_LOCAL } from './useSkyState'

/**
 * Living clouds (v3.5 — replaces the static instanced clusters). A pooled
 * system of primitive box-cluster clouds (playbook §4 shapes, style bible),
 * planet-local at ~25 m altitude. Each slot: fade+scale in over ~3 s, drift
 * along a great circle on one global wind, live 60–120 s, fade out, respawn
 * somewhere new — never within ~18° of the sun or moon disc (spawn OR
 * drift path). Tint is per-frame: warm underlit near the sun's azimuth,
 * cool dark on the night side. One mesh per slot (8 high / 5 low tier —
 * within the ≤8 extra draw call budget); transparent + depthWrite:false so
 * fades never sort-glitch. The frame loop mutates refs/materials only.
 */

const ALTITUDE_R = 80 // planet 55 + ~25 m
const POOL_HIGH = 8
const POOL_LOW = 5
const WIND_RAD_PER_S = 0.75 / ALTITUDE_R // one global wind, ~0.75 m/s
const FADE_S = 3
const LIFE_MIN_S = 60
const LIFE_MAX_S = 120
const AVOID_RAD = THREE.MathUtils.degToRad(18)
const SPAWN_POLAR_MIN = THREE.MathUtils.degToRad(18)
const SPAWN_POLAR_MAX = THREE.MathUtils.degToRad(70)
/** Fixed planet-local wind axis — oblique so paths cross the island. */
const WIND_AXIS = new THREE.Vector3(0.35, 0.8, 0.49).normalize()

const VARIANT_SEEDS = [4001, 4013, 4027]

const NEUTRAL = new THREE.Color('#fff1dd')
const WARM = new THREE.Color('#ffd2ad')
const WARM_EMISSIVE = new THREE.Color('#ff9e5e')
const NIGHT_COL = new THREE.Color('#8f9ec4')

/** One puffy cluster: 4–6 flattened RoundedBox chunks merged (all pieces
 * normalized non-indexed — mixing index-ness returns null). */
function buildCloudVariant(seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed)
  const chunkCount = 4 + Math.floor(rand() * 3)
  const flattenY = THREE.MathUtils.lerp(0.5, 0.6, rand())
  const pieces: THREE.BufferGeometry[] = []
  for (let i = 0; i < chunkCount; i++) {
    const w = THREE.MathUtils.lerp(1.6, 3.0, rand())
    const d = THREE.MathUtils.lerp(1.6, 3.0, rand())
    const h = THREE.MathUtils.lerp(1.0, 1.7, rand())
    const chunk = new RoundedBoxGeometry(w, h, d, 1, 0.4)
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3((rand() - 0.5) * 4.4, (rand() - 0.5) * 0.4, (rand() - 0.5) * 4.4),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2),
      new THREE.Vector3(1, flattenY, 1),
    )
    pieces.push(normalizeForMerge(chunk).applyMatrix4(matrix))
  }
  const merged = mergeGeometries(pieces)
  pieces.forEach((g) => g !== merged && g.dispose())
  return merged
}

interface CloudSlot {
  spawnDir: THREE.Vector3
  age: number
  lifeS: number
  baseScale: number
  yaw: number
}

/** Angular clearance of the whole drift path from both discs. */
function pathClear(spawnDir: THREE.Vector3, lifeS: number): boolean {
  for (const t of [0, 0.5, 1]) {
    _q.setFromAxisAngle(WIND_AXIS, WIND_RAD_PER_S * lifeS * t)
    _dir.copy(spawnDir).applyQuaternion(_q)
    if (_dir.angleTo(SUN_DISC_LOCAL) < AVOID_RAD) return false
    if (_dir.angleTo(MOON_DISC_LOCAL) < AVOID_RAD) return false
  }
  return true
}

function respawn(slot: CloudSlot): void {
  for (let tries = 0; tries < 24; tries++) {
    const polar = THREE.MathUtils.lerp(SPAWN_POLAR_MIN, SPAWN_POLAR_MAX, Math.random())
    const az = Math.random() * Math.PI * 2
    slot.spawnDir.set(
      Math.sin(polar) * Math.sin(az),
      Math.cos(polar),
      Math.sin(polar) * Math.cos(az),
    )
    slot.lifeS = THREE.MathUtils.lerp(LIFE_MIN_S, LIFE_MAX_S, Math.random())
    if (pathClear(slot.spawnDir, slot.lifeS)) break
  }
  slot.age = 0
  slot.baseScale = THREE.MathUtils.lerp(0.8, 1.5, Math.random())
  slot.yaw = Math.random() * Math.PI * 2
}

// Frame-loop scratch.
const _q = new THREE.Quaternion()
const _dir = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _c = new THREE.Color()
const _e = new THREE.Color()

export function Clouds() {
  const qualityTier = useStore((s) => s.qualityTier)
  const poolSize = qualityTier === 'low' ? POOL_LOW : POOL_HIGH

  const variants = useMemo(() => VARIANT_SEEDS.map(buildCloudVariant), [])
  const materials = useMemo(
    () =>
      Array.from({ length: POOL_HIGH }, () => {
        const m = new THREE.MeshLambertMaterial({
          color: '#fff1dd',
          flatShading: true,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        })
        m.emissive.set('#fff1dd')
        m.emissiveIntensity = 0.42
        return m
      }),
    [],
  )
  const meshRefs = useRef<(THREE.Mesh | null)[]>([])
  const slots = useRef<CloudSlot[]>(
    Array.from({ length: POOL_HIGH }, (_, i) => {
      const slot: CloudSlot = {
        spawnDir: new THREE.Vector3(0, 1, 0),
        age: 0,
        lifeS: 90,
        baseScale: 1,
        yaw: 0,
      }
      respawn(slot)
      // Stagger initial ages so the pool doesn't breathe in unison.
      slot.age = (i / POOL_HIGH) * slot.lifeS * 0.8
      return slot
    }),
  )

  useFrame((_state, dt) => {
    const nightMix = skyRuntime.nightMix
    for (let i = 0; i < poolSize; i++) {
      const slot = slots.current[i]
      const mesh = meshRefs.current[i]
      if (!mesh) continue
      slot.age += dt
      if (slot.age >= slot.lifeS) respawn(slot)

      // Position along the great-circle drift; orient up along the normal.
      _q.setFromAxisAngle(WIND_AXIS, WIND_RAD_PER_S * slot.age)
      _dir.copy(slot.spawnDir).applyQuaternion(_q)
      mesh.position.copy(_dir).multiplyScalar(ALTITUDE_R)
      mesh.quaternion.setFromUnitVectors(_up, _dir)
      mesh.rotateY(slot.yaw)

      // Fade+scale envelope (in over FADE_S, out over the last FADE_S).
      const env =
        THREE.MathUtils.smoothstep(slot.age, 0, FADE_S) *
        (1 - THREE.MathUtils.smoothstep(slot.age, slot.lifeS - FADE_S, slot.lifeS))
      const s = slot.baseScale * (0.6 + 0.4 * env)
      mesh.scale.set(s, s, s)
      const mat = materials[i]
      mat.opacity = 0.92 * env

      // Per-frame tint: warm underlit near the sun's azimuth, cool dark on
      // the night side (angular distance + nightMix).
      const sunDist = _dir.angleTo(SUN_DISC_LOCAL)
      const warmW = (1 - THREE.MathUtils.smoothstep(sunDist, 0.5, 1.4)) *
        (1 - THREE.MathUtils.smoothstep(nightMix, 0.55, 0.85))
      const nightW = THREE.MathUtils.smoothstep(nightMix, 0.5, 0.85)
      _c.copy(NEUTRAL).lerp(WARM, warmW).lerp(NIGHT_COL, nightW)
      _e.copy(NEUTRAL).lerp(WARM_EMISSIVE, warmW).lerp(NIGHT_COL, nightW)
      mat.color.copy(_c)
      mat.emissive.copy(_e)
      mat.emissiveIntensity = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(0.42, 0.52, warmW),
        0.3,
        nightW,
      )
    }
    // Slots beyond the active pool stay hidden (tier drop mid-session).
    for (let i = poolSize; i < POOL_HIGH; i++) {
      const mesh = meshRefs.current[i]
      if (mesh) materials[i].opacity = 0
    }
  })

  return (
    <>
      {Array.from({ length: POOL_HIGH }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshRefs.current[i] = m
          }}
          geometry={variants[i % variants.length]}
          material={materials[i]}
        />
      ))}
    </>
  )
}
