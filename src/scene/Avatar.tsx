import { forwardRef } from 'react'
import * as THREE from 'three'

/**
 * Interim stand-in after the imported glTF avatar's removal: a flat-shaded
 * capsule with the blob shadow. Replaced by the parameterized BlockyCharacter
 * rig (style bible / playbook §1–2) in the next commit. The outer group is
 * driven by the planet controller (position.y + facing).
 */
export const Avatar = forwardRef<THREE.Group>(function Avatar(_, ref) {
  return (
    <group ref={ref}>
      <mesh position={[0, 0.85, 0]}>
        <capsuleGeometry args={[0.32, 0.7, 4, 8]} />
        <meshLambertMaterial color="#ffd24d" flatShading />
      </mesh>
      {/* Cheap blob shadow grounds the avatar without shadow maps. Sits at
          0.1 so the caps' ±0.08 vertex jitter can't poke through it. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.1, 0]}>
        <circleGeometry args={[0.5, 20]} />
        <meshBasicMaterial color="#14262b" transparent opacity={0.22} depthWrite={false} />
      </mesh>
    </group>
  )
})
