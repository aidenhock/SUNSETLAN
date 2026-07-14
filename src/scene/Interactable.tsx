import { BallCollider, RigidBody } from '@react-three/rapier'
import type { InteractableDef } from '../content/interactables'
import { useStore } from '../store/useStore'

const SENSOR_RADIUS = 2.5

export function Interactable({ def }: { def: InteractableDef }) {
  const isNearby = useStore((s) => s.nearbyId === def.id)
  const setNearby = useStore((s) => s.setNearby)
  const openModal = useStore((s) => s.openModal)

  return (
    <group position={def.position} rotation={def.rotation}>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh
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
      </RigidBody>
      <BallCollider
        args={[SENSOR_RADIUS]}
        sensor
        onIntersectionEnter={() => setNearby(def.id)}
        onIntersectionExit={() => {
          if (useStore.getState().nearbyId === def.id) setNearby(null)
        }}
      />
    </group>
  )
}
