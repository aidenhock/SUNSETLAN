import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useStore } from '../store/useStore'
import { mulberry32 } from './geometryUtils'
import { IDENTITY_Q, StaticInstances, surfacePartMatrix } from './instancing'
import { normalizeForMerge } from './props'

/**
 * Hand-built box-cluster clouds (playbook §4 — Aviator pattern). NEVER drei
 * <Cloud>/<Clouds> (billboard sprites needing a texture); these are merged
 * geometry, flat-shaded, no textures. Mounted inside the rotating planet
 * group by the caller, so every placement here is planet-local: a warm,
 * plentiful population welded over the sunset-side water and a sparse cool
 * population over the night side, drifting together as one slow rotation.
 */

/** 2–3 seeded cluster variants; each seed is a full deterministic build. */
const VARIANT_SEEDS = [4001, 4013, 4027]

// Soft self-emissive lifts the Lambert undersides — pure lit clouds read
// grey-brown against the warm sky; cozy clouds stay bright all around.
const WARM_MATERIAL = new THREE.MeshLambertMaterial({ color: '#fff1dd', flatShading: true })
WARM_MATERIAL.emissive.set('#fff1dd')
WARM_MATERIAL.emissiveIntensity = 0.42
const NIGHT_MATERIAL = new THREE.MeshLambertMaterial({ color: '#8f9ec4', flatShading: true })
NIGHT_MATERIAL.emissive.set('#8f9ec4')
NIGHT_MATERIAL.emissiveIntensity = 0.3

/** Altitude band above the surface (planet radius 55) — sky layer, not ground. */
const ALT_MIN = 38
const ALT_MAX = 48

const ORIGIN = new THREE.Vector3()
/** Drift is an oscillating sway, not an accumulating spin: a one-way yaw
 * walks the warm population onto the night side (wrong tint) within
 * minutes. ±0.06 rad over a ~2 min period reads as slow wander forever. */
const DRIFT_AMP_RAD = 0.06
const DRIFT_FREQ = 0.05

interface CloudPopulation {
  latMin: number
  latMax: number
  longCenter: number
  longSpread: number
  countHigh: number
  countLow: number
  seed: number
}

/** Plentiful, warm — day-leaning side. */
const WARM_POP: CloudPopulation = {
  latMin: 8,
  latMax: 65,
  longCenter: 0,
  longSpread: 75,
  countHigh: 14,
  countLow: 8,
  seed: 9001,
}

/** Sparse, cool — night side. */
const NIGHT_POP: CloudPopulation = {
  latMin: 8,
  latMax: 55,
  longCenter: 180,
  longSpread: 60,
  countHigh: 5,
  countLow: 3,
  seed: 9101,
}

/**
 * One puffy cluster: 4–6 flattened RoundedBox chunks (segments 1 → already
 * non-indexed, playbook §4) scattered to overlap into a ~6–9 m blob, merged
 * into a single draw-call geometry. mergeGeometries needs identical, all-
 * non-indexed attribute sets across pieces (props.test.ts pattern) —
 * normalizeForMerge guarantees that here too.
 */
function buildCloudVariant(seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed)
  const chunkCount = 4 + Math.floor(rand() * 3) // 4..6
  const flattenY = THREE.MathUtils.lerp(0.5, 0.6, rand()) // one squash per cluster
  const pieces: THREE.BufferGeometry[] = []
  for (let i = 0; i < chunkCount; i++) {
    const w = THREE.MathUtils.lerp(1.6, 3.0, rand())
    const d = THREE.MathUtils.lerp(1.6, 3.0, rand())
    const h = THREE.MathUtils.lerp(1.0, 1.7, rand())
    const chunk = new RoundedBoxGeometry(w, h, d, 1, 0.4)
    const x = (rand() - 0.5) * 4.4
    const z = (rand() - 0.5) * 4.4
    const y = (rand() - 0.5) * 0.4
    const yaw = rand() * Math.PI * 2
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      new THREE.Vector3(1, flattenY, 1),
    )
    pieces.push(normalizeForMerge(chunk).applyMatrix4(matrix))
  }
  const merged = mergeGeometries(pieces)
  pieces.forEach((g) => g !== merged && g.dispose())
  return merged
}

/**
 * Placement matrices for one population, bucketed by cluster variant so each
 * bucket becomes one StaticInstances draw call. Deterministic per population
 * seed: lat/long/altitude/yaw/scale/variant all pulled from one stream.
 */
function buildPopulationMatrices(
  pop: CloudPopulation,
  count: number,
  variantCount: number,
): THREE.Matrix4[][] {
  const rand = mulberry32(pop.seed)
  const perVariant: THREE.Matrix4[][] = Array.from({ length: variantCount }, () => [])
  for (let i = 0; i < count; i++) {
    const lat = THREE.MathUtils.lerp(pop.latMin, pop.latMax, rand())
    const long = pop.longCenter + (rand() * 2 - 1) * pop.longSpread
    const altitude = THREE.MathUtils.lerp(ALT_MIN, ALT_MAX, rand())
    const yaw = rand() * Math.PI * 2
    const scale = THREE.MathUtils.lerp(0.8, 1.5, rand())
    const variant = Math.min(variantCount - 1, Math.floor(rand() * variantCount))
    perVariant[variant].push(surfacePartMatrix(lat, long, altitude, yaw, ORIGIN, IDENTITY_Q, scale))
  }
  return perVariant
}

export function Clouds() {
  const qualityTier = useStore((s) => s.qualityTier)
  const driftRef = useRef<THREE.Group>(null)

  const variants = useMemo(() => VARIANT_SEEDS.map(buildCloudVariant), [])

  const warm = useMemo(
    () => buildPopulationMatrices(WARM_POP, qualityTier === 'low' ? WARM_POP.countLow : WARM_POP.countHigh, variants.length),
    [qualityTier, variants.length],
  )
  const night = useMemo(
    () => buildPopulationMatrices(NIGHT_POP, qualityTier === 'low' ? NIGHT_POP.countLow : NIGHT_POP.countHigh, variants.length),
    [qualityTier, variants.length],
  )

  // Slow planet-local sway — mutate the ref only, no allocations/state.
  useFrame((state) => {
    const g = driftRef.current
    if (g) g.rotation.y = Math.sin(state.clock.elapsedTime * DRIFT_FREQ) * DRIFT_AMP_RAD
  })

  return (
    <group ref={driftRef}>
      {variants.map(
        (geo, i) =>
          warm[i].length > 0 && (
            <StaticInstances key={`warm-${i}`} geometry={geo} material={WARM_MATERIAL} matrices={warm[i]} />
          ),
      )}
      {variants.map(
        (geo, i) =>
          night[i].length > 0 && (
            <StaticInstances key={`night-${i}`} geometry={geo} material={NIGHT_MATERIAL} matrices={night[i]} />
          ),
      )}
    </group>
  )
}
