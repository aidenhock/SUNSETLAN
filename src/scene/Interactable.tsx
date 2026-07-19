import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { meridianYaw, surfaceQuaternion } from '../controls/planetMath'
import type { InteractableDef, PropKind } from '../content/interactables'
import { useStore } from '../store/useStore'
import { buildMailbox, buildTripod, type PropPart } from './props'

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
          <mesh position={[0, 0.75, 0]} onClick={onClick} {...hover}>
            <boxGeometry args={[1.5, 1.5, 1.5]} />
            <meshLambertMaterial
              color={isNearby ? '#35a7a0' : '#1d6e73'}
              emissive={isNearby ? '#35a7a0' : '#000000'}
              emissiveIntensity={0.25}
              flatShading
            />
          </mesh>
        )}
      </group>
    </group>
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
