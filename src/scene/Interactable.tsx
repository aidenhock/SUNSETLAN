import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { meridianYaw, surfaceQuaternion } from '../controls/planetMath'
import type { InteractableDef, PropKind } from '../content/interactables'
import { useStore } from '../store/useStore'
import { buildMailbox, buildTripod, type PropPart } from './props'
import { skyRuntime } from './useSkyState'

const PROP_BUILDERS: Record<PropKind, () => PropPart[]> = {
  tripod: buildTripod,
  mailbox: buildMailbox,
}

/**
 * An interactable, oriented to stand on the sphere with meridian-aligned yaw
 * (rotation[1] is relative to local north, like every SurfaceGroup prop).
 * Renders its chunky primitive prop when `prop` is set (see props.ts), else
 * the placeholder box. Proximity is angular distance, computed centrally in
 * usePlanetController — this component only renders and handles clicks/taps.
 */
export function Interactable({ def }: { def: InteractableDef }) {
  const isNearby = useStore((s) => s.nearbyId === def.id)
  const openModal = useStore((s) => s.openModal)

  const { quaternion, rotation } = useMemo(() => {
    const unit = new THREE.Vector3(...def.position).normalize()
    const lat = 90 - THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(unit.y, -1, 1)))
    const long = THREE.MathUtils.radToDeg(Math.atan2(unit.x, unit.z))
    return {
      quaternion: surfaceQuaternion(unit),
      rotation: new THREE.Euler(
        def.rotation[0],
        def.rotation[1] + meridianYaw(lat, long),
        def.rotation[2],
      ),
    }
  }, [def.position, def.rotation])

  const onClick = (e: { delta: number }) => {
    // While pointer-locked, clicks raycast from the stale pre-lock cursor
    // position — never open from those. Ignore orbit drags too.
    if (document.pointerLockElement) return
    if (e.delta > 5) return
    document.body.style.cursor = 'auto'
    openModal(def.id)
  }
  const hover = {
    onPointerOver: () => (document.body.style.cursor = 'pointer'),
    onPointerOut: () => (document.body.style.cursor = 'auto'),
  }

  return (
    <group position={def.position} quaternion={quaternion}>
      <group rotation={rotation}>
        {def.prop ? (
          <PropBody kind={def.prop} isNearby={isNearby} onClick={onClick} hover={hover} />
        ) : (
          <PlaceholderBody def={def} isNearby={isNearby} onClick={onClick} hover={hover} />
        )}
      </group>
    </group>
  )
}

/**
 * Placeholder cube in pastel lagoon (the old #1d6e73 read as a dark
 * off-palette slab). The Videos cube is the CRT stand-in: its screen glow
 * ramps with nightMix — pale blue emissive + a weak point light — so the
 * TV reads at night per the 3B spec.
 */
function PlaceholderBody({
  def,
  isNearby,
  onClick,
  hover,
}: {
  def: InteractableDef
  isNearby: boolean
  onClick: (e: { delta: number }) => void
  hover: { onPointerOver: () => void; onPointerOut: () => void }
}) {
  const matRef = useRef<THREE.MeshLambertMaterial>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const isTv = def.id === 'videos'

  useFrame(() => {
    if (!isTv) return
    const glow = skyRuntime.nightMix * 0.9
    const mat = matRef.current
    if (mat && !isNearby) {
      mat.emissive.setRGB(0.75 * glow, 0.88 * glow, 1.0 * glow)
      mat.emissiveIntensity = 1
    }
    const light = lightRef.current
    if (light) light.intensity = glow * 2.2
  })

  return (
    <mesh position={[0, 0.75, 0]} onClick={onClick} {...hover}>
      <boxGeometry args={[1.5, 1.5, 1.5]} />
      <meshLambertMaterial
        ref={matRef}
        color={isNearby ? '#5ecec7' : '#35a7a0'}
        emissive={isNearby ? '#5ecec7' : '#000000'}
        emissiveIntensity={isNearby ? 0.25 : 1}
        flatShading
      />
      {isTv && <pointLight ref={lightRef} position={[0, 0.3, 1.2]} distance={7} intensity={0} color="#bfe0ff" />}
    </mesh>
  )
}

/** Chunky prop body with a lagoon emissive pulse when the player is near. */
function PropBody({
  kind,
  isNearby,
  onClick,
  hover,
}: {
  kind: PropKind
  isNearby: boolean
  onClick: (e: { delta: number }) => void
  hover: { onPointerOver: () => void; onPointerOut: () => void }
}) {
  // Clone the shared palette materials so the highlight never leaks into
  // other props using the same colors.
  const parts = useMemo(
    () =>
      PROP_BUILDERS[kind]().map((p) => ({
        ...p,
        material: p.material.clone(),
      })),
    [kind],
  )
  useEffect(() => {
    for (const p of parts) {
      p.material.emissive.set(isNearby ? '#35a7a0' : '#000000')
      p.material.emissiveIntensity = 0.35
    }
  }, [parts, isNearby])

  return (
    <>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={p.material} onClick={onClick} {...hover} />
      ))}
    </>
  )
}
