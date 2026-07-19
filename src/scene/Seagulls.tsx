import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { latLongToUnit } from '../controls/planetMath'
import { useStore } from '../store/useStore'
import { tintGeometry } from './geometryUtils'
import { PLANET_RADIUS } from './planetConfig'
import { normalizeForMerge, paletteMaterial, PROP_COLORS } from './props'

/**
 * Seagulls (CLAUDE.md 3B; Ambient life: "two-plane flap on tilted orbits
 * above sunset water"). Planet-local — mount inside the rotating planet
 * group so the loops stay welded to the sunset side with the rest of the
 * sky. Pivot groups + sin, no skeleton, same idiom as BlockyCharacter
 * (playbook §1–2): mutate refs in useFrame, never React state.
 */

interface GullDef {
  /** Orbit center, above the sunset-side water (lat < the ~15 beach edge). */
  lat: number
  long: number
  /** Orbit-center altitude above sea level, meters (9–14). */
  altitude: number
  /** Fixed Euler tilt of the orbit plane — literal, not surface-derived. */
  tiltX: number
  tiltZ: number
  /** Loop radius around the center, meters (5–9). */
  orbitRadius: number
  /** Orbit angular speed, rad/s. */
  speed: number
  /** Initial orbit angle so gulls don't stack. */
  phase: number
  /** Wing flap frequency (rad/s) and phase — offset per gull so they don't sync. */
  wingFreq: number
  wingPhase: number
}

/** Deterministic per-gull params — no Math.random, placements stay stable. */
const GULLS: GullDef[] = [
  { lat: 8, long: 350, altitude: 10, tiltX: 0.25, tiltZ: -0.2, orbitRadius: 6, speed: 0.3, phase: 0, wingFreq: 2.6, wingPhase: 0 },
  { lat: 5, long: 2, altitude: 12.5, tiltX: 0.32, tiltZ: 0.28, orbitRadius: 7.5, speed: 0.38, phase: 2.1, wingFreq: 3.1, wingPhase: 1.4 },
  { lat: 10, long: 12, altitude: 13.5, tiltX: 0.38, tiltZ: -0.35, orbitRadius: 8.5, speed: 0.44, phase: 4.2, wingFreq: 2.85, wingPhase: 2.6 },
]

const WING_FLAP_AMP = 0.55

const bodyMat = paletteMaterial(PROP_COLORS.cream)

// Body + beak merged into one vertex-colored geometry (BlockyCharacter
// pattern): 3 draw calls per gull instead of 4 — the mobile budget is tight.
const bodyGeo = (() => {
  const body = tintGeometry(normalizeForMerge(new THREE.BoxGeometry(0.5, 0.22, 0.7)), PROP_COLORS.cream)
  const beak = tintGeometry(normalizeForMerge(new THREE.BoxGeometry(0.08, 0.08, 0.18)), PROP_COLORS.ember)
  beak.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, -0.42))
  const merged = mergeGeometries([body, beak])
  body.dispose()
  beak.dispose()
  return merged
})()
const gullBodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })

function Gull({ def }: { def: GullDef }) {
  const orbiter = useRef<THREE.Group>(null)
  const wingL = useRef<THREE.Group>(null)
  const wingR = useRef<THREE.Group>(null)

  const { center, tilt } = useMemo(
    () => ({
      center: latLongToUnit(def.lat, def.long).multiplyScalar(PLANET_RADIUS + def.altitude),
      tilt: [def.tiltX, 0, def.tiltZ] as [number, number, number],
    }),
    [def],
  )

  useFrame((state) => {
    const o = orbiter.current
    const wl = wingL.current
    const wr = wingR.current
    if (!o || !wl || !wr) return
    const t = state.clock.elapsedTime
    o.rotation.y = def.phase + t * def.speed
    const flap = Math.sin(t * def.wingFreq + def.wingPhase) * WING_FLAP_AMP
    wl.rotation.z = flap
    wr.rotation.z = -flap
  })

  return (
    <group position={center} rotation={tilt}>
      <group ref={orbiter}>
        {/* Body's local -Z is the beak/forward axis: parked at
            (orbitRadius, 0, 0), that axis already tracks the tangent of
            increasing rotation.y — a fixed yaw, no per-frame lookAt. */}
        <group position={[def.orbitRadius, 0, 0]}>
          <mesh geometry={bodyGeo} material={gullBodyMat} />
          <group ref={wingL} position={[-0.25, 0.03, 0]}>
            <mesh material={bodyMat} position={[-0.425, 0, 0]}>
              <boxGeometry args={[0.85, 0.05, 0.3]} />
            </mesh>
          </group>
          <group ref={wingR} position={[0.25, 0.03, 0]}>
            <mesh material={bodyMat} position={[0.425, 0, 0]}>
              <boxGeometry args={[0.85, 0.05, 0.3]} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}

/** 3 gulls on 'high', 2 on 'low' (CLAUDE.md performance budgets §3B gating). */
export function Seagulls() {
  const qualityTier = useStore((s) => s.qualityTier)
  const gulls = qualityTier === 'low' ? GULLS.slice(0, 2) : GULLS

  return (
    <>
      {gulls.map((def, i) => (
        <Gull key={i} def={def} />
      ))}
    </>
  )
}
