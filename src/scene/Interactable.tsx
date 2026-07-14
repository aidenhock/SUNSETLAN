import { useMemo } from 'react'
import * as THREE from 'three'
import { surfaceQuaternion } from '../controls/planetMath'
import type { InteractableDef } from '../content/interactables'
import { useStore } from '../store/useStore'

/**
 * Placeholder box for an interactable, oriented to stand on the sphere.
 * Proximity is angular distance, computed centrally in usePlanetController —
 * this component only renders and handles direct clicks/taps.
 */
export function Interactable({ def }: { def: InteractableDef }) {
  const isNearby = useStore((s) => s.nearbyId === def.id)
  const openModal = useStore((s) => s.openModal)

  const quaternion = useMemo(
    () => surfaceQuaternion(new THREE.Vector3(...def.position).normalize()),
    [def.position],
  )

  return (
    <group position={def.position} quaternion={quaternion}>
      <group rotation={def.rotation}>
        <mesh
          position={[0, 0.75, 0]}
          onClick={(e) => {
            // Ignore camera-orbit drags that happen to end on the mesh.
            if (e.delta > 5) return
            document.body.style.cursor = 'auto'
            openModal(def.id)
          }}
          onPointerOver={() => (document.body.style.cursor = 'pointer')}
          onPointerOut={() => (document.body.style.cursor = 'auto')}
        >
          <boxGeometry args={[1.5, 1.5, 1.5]} />
          <meshStandardMaterial
            color={isNearby ? '#35a7a0' : '#1d6e73'}
            emissive={isNearby ? '#35a7a0' : '#000000'}
            emissiveIntensity={0.25}
            flatShading
          />
        </mesh>
      </group>
    </group>
  )
}
