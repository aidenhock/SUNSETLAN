import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { onAudioResume, play2d } from '../audio/core'
import { poleInPlanetSpace, WORLD_UP } from '../controls/planetMath'
import { controlsRuntime } from '../controls/usePlanetController'
import { useStore } from '../store/useStore'
import { mooringLatLong, mooringYaw } from './boat'
import { IDENTITY_Q, surfacePartMatrix } from './instancing'
import { PLANET_RADIUS, surfOffset } from './planetConfig'
import { buildBoat } from './props'

/**
 * The boat, drawn in the two places it can be.
 *
 * MOORED it is planet-local: a mesh parked on the water beside a dock's
 * far end, bobbing on the live surf, turning with the world like every
 * other prop. DRIVING it is world-fixed at the pole, outside the planet
 * group, exactly like the avatar — because while you drive, the boat is
 * the thing that doesn't move and the ocean is what turns.
 *
 * The hand-off happens on the tween boundaries (controlsRuntime.boating),
 * which is the one moment the two poses coincide, so it never jumps.
 */

/** Built once: the same geometry serves both meshes. */
let cachedParts: ReturnType<typeof buildBoat> | null = null
function boatParts() {
  cachedParts ??= buildBoat()
  return cachedParts
}

/** Deck bob — the same formula the controller publishes, so the hull and
 *  the player on it rise and fall together. */
function bobAt(polarRad: number, t: number): number {
  return 0.05 * Math.sin(t * 4.4) + surfOffset(polarRad, t)
}


/** The boat at its mooring: planet-local, visible whenever nobody is
 *  aboard (the driving mesh owns the frame otherwise). */
export function MooredBoat() {
  const at = useStore((s) => s.boat.at)
  const meshRef = useRef<THREE.Mesh>(null)
  const parts = boatParts()

  // Place once per dock, not per frame: decompose the usual meridian-
  // aligned surface matrix and keep the unit + rotation.
  const spot = useMemo(() => {
    const { lat, long } = mooringLatLong(at)
    const m = surfacePartMatrix(
      lat,
      long,
      0,
      mooringYaw(at),
      new THREE.Vector3(),
      IDENTITY_Q,
      1,
    )
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    m.decompose(pos, quat, new THREE.Vector3())
    const unit = pos.clone().normalize()
    return { unit, quat, polar: Math.acos(THREE.MathUtils.clamp(unit.y, -1, 1)) }
  }, [at])

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.visible = !controlsRuntime.boating
    if (!mesh.visible) return
    mesh.position
      .copy(spot.unit)
      .multiplyScalar(PLANET_RADIUS + bobAt(spot.polar, state.clock.elapsedTime))
  })

  return (
    <mesh
      ref={meshRef}
      geometry={parts[0].geometry}
      material={parts[0].material}
      quaternion={spot.quat}
    />
  )
}

/** The boat under the player: world-fixed at the pole, a sibling of the
 *  avatar, rolling and pitching on the swell. */
export function DrivingBoat() {
  const meshRef = useRef<THREE.Mesh>(null)
  const parts = boatParts()

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.visible = controlsRuntime.boating
    if (!mesh.visible) return
    mesh.position.set(0, PLANET_RADIUS + controlsRuntime.boatBob, 0)
    mesh.rotation.set(controlsRuntime.boatPitch, controlsRuntime.boatHeading, controlsRuntime.boatRoll)
  })

  return <mesh ref={meshRef} visible={false} geometry={parts[0].geometry} material={parts[0].material} />
}

// ---- wake ------------------------------------------------------------
// A short foam trail so the water shows that you are moving. One pooled
// InstancedMesh of flat discs, stamped at the pole's PLANET-LOCAL spot —
// so each puff stays on the water behind you as the world turns, the
// same trick the footprints use in the sand. Fading is a colour lerp
// toward the sea (per-instance alpha isn't a thing).

const WAKE_POOL = 24
const WAKE_LIFE_S = 1.6
const WAKE_EVERY_S = 0.25
const WAKE_SPEED_MPS = 2
const FOAM = new THREE.Color('#ffffff')
const SEA = new THREE.Color('#35a7a0')

const _wakeM = new THREE.Matrix4()
const _wakeQ = new THREE.Quaternion()
const _wakeUnit = new THREE.Vector3()
const _wakeScale = new THREE.Vector3(1, 1, 1)
const _wakeColor = new THREE.Color()

export function BoatWake() {
  const tier = useStore((s) => s.qualityTier)
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const ages = useRef<number[]>(Array.from({ length: WAKE_POOL }, () => Infinity))
  const mats = useRef<THREE.Matrix4[]>(
    Array.from({ length: WAKE_POOL }, () => new THREE.Matrix4()),
  )
  const next = useRef(0)
  const stampT = useRef(0)
  // Driving splashes are bag-timed; a tab that comes back re-baselines
  // instead of owing a backlog (CLAUDE.md tab-hidden rules).
  const nextSplash = useRef(0)
  const rebase = useRef(true)
  useEffect(() => onAudioResume(() => { rebase.current = true }), [])

  const geo = useMemo(() => {
    const g = new THREE.CircleGeometry(0.35, 12)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])

  useFrame((state, rawDt) => {
    const mesh = meshRef.current
    if (!mesh) return
    const dt = Math.min(rawDt, 0.1)
    const t = state.clock.elapsedTime
    const driving = controlsRuntime.boating && controlsRuntime.boatSpeed > WAKE_SPEED_MPS

    if (rebase.current) {
      nextSplash.current = t + 1.3 + Math.random() * 0.9
      rebase.current = false
    }
    if (controlsRuntime.boating && controlsRuntime.boatSpeed > 3) {
      if (t >= nextSplash.current) {
        const s = Math.min(1, controlsRuntime.boatSpeed / 11)
        void play2d('splash', 'world', 0.12 + 0.13 * s)
        nextSplash.current = t + 1.3 + Math.random() * 0.9
      }
    } else {
      nextSplash.current = Math.max(nextSplash.current, t)
    }

    if (driving && tier !== 'low') {
      stampT.current += dt
      if (stampT.current >= WAKE_EVERY_S) {
        stampT.current = 0
        poleInPlanetSpace(controlsRuntime.planetQuaternion, _wakeUnit)
        _wakeQ.setFromUnitVectors(WORLD_UP, _wakeUnit)
        _wakeM.compose(
          _wakeUnit.multiplyScalar(PLANET_RADIUS + 0.03),
          _wakeQ,
          _wakeScale,
        )
        mats.current[next.current].copy(_wakeM)
        ages.current[next.current] = 0
        next.current = (next.current + 1) % WAKE_POOL
      }
    }

    let any = false
    for (let i = 0; i < WAKE_POOL; i++) {
      const age = ages.current[i]
      if (age >= WAKE_LIFE_S) {
        mesh.setMatrixAt(i, _wakeM.makeScale(0, 0, 0))
        continue
      }
      ages.current[i] = age + dt
      any = true
      mesh.setMatrixAt(i, mats.current[i])
      _wakeColor.copy(FOAM).lerp(SEA, THREE.MathUtils.smoothstep(age / WAKE_LIFE_S, 0, 1))
      mesh.setColorAt(i, _wakeColor)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.visible = any
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[geo, undefined, WAKE_POOL]}
      frustumCulled={false}
      renderOrder={2}
      visible={false}
    >
      <meshBasicMaterial transparent opacity={0.6} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  )
}

