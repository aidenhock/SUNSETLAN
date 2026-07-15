import { useMemo } from 'react'
import * as THREE from 'three'
import { meridianYaw, surfaceQuaternion } from '../controls/planetMath'
import type { InteractableDef } from '../content/interactables'
import { useStore } from '../store/useStore'

/**
 * Placeholder box for an interactable, oriented to stand on the sphere with
 * meridian-aligned yaw (rotation[1] is relative to local north, like every
 * SurfaceGroup prop). Proximity is angular distance, computed centrally in
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

  return (
    <group position={def.position} quaternion={quaternion}>
      <group rotation={rotation}>
        <mesh
          position={[0, 0.75, 0]}
          onClick={(e) => {
            // While pointer-locked, clicks raycast from the stale pre-lock
            // cursor position — never open from those.
            if (document.pointerLockElement) return
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
