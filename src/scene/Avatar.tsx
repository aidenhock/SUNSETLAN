import { forwardRef } from 'react'
import * as THREE from 'three'

/**
 * Placeholder capsule avatar, fixed at the world pole. The planet controller
 * drives position.y (terrain + jump arc) and rotation.y (facing). Nose block
 * marks +Z so the facing direction reads.
 */
export const Avatar = forwardRef<THREE.Group>(function Avatar(_, ref) {
  return (
    <group ref={ref}>
      <group position={[0, 0.65, 0]}>
        <mesh>
          <capsuleGeometry args={[0.3, 0.7]} />
          <meshStandardMaterial color="#55a05f" flatShading />
        </mesh>
        <mesh position={[0, 0.35, 0.26]}>
          <boxGeometry args={[0.14, 0.14, 0.14]} />
          <meshStandardMaterial color="#14262b" flatShading />
        </mesh>
      </group>
      {/* Cheap blob shadow grounds the avatar without shadow maps. Sits at
          0.1 so the caps' ±0.08 vertex jitter can't poke through it. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.1, 0]}>
        <circleGeometry args={[0.5, 20]} />
        <meshBasicMaterial color="#14262b" transparent opacity={0.22} depthWrite={false} />
      </mesh>
    </group>
  )
})
