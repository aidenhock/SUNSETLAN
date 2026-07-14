import { useCallback, useRef } from 'react'
import * as THREE from 'three'
import { usePlanetController } from '../controls/usePlanetController'
import { usePointerLockCamera } from '../controls/usePointerLockCamera'
import { interactables } from '../content/interactables'
import { Avatar } from './Avatar'
import { Interactable } from './Interactable'
import { Island } from './Island'
import { PLANET_RADIUS } from './planetConfig'
import type { RegisterCollision } from './SurfaceGroup'
import { Water } from './Water'

/**
 * The whole rotating world. One group owns the planet quaternion; the avatar
 * stays fixed at the pole. The touch joystick is a DOM overlay owned by App.
 */
export function PlanetScene({ isTouch }: { isTouch: boolean }) {
  const planetRef = useRef<THREE.Group>(null)
  const avatarRef = useRef<THREE.Group>(null)
  const collisionRefs = useRef<(THREE.Mesh | null)[]>([])

  const registerCollision = useCallback<RegisterCollision>((mesh) => {
    if (mesh && !collisionRefs.current.includes(mesh)) collisionRefs.current.push(mesh)
  }, [])

  usePlanetController({ planetRef, avatarRef, collisionRefs })
  usePointerLockCamera({ avatarRef, isTouch })

  return (
    <>
      <group ref={planetRef}>
        {/* Ocean floor — the planet body under the water shell. */}
        <mesh>
          <sphereGeometry args={[PLANET_RADIUS - 0.4, 48, 24]} />
          <meshStandardMaterial color="#16565b" flatShading />
        </mesh>
        <Water registerCollision={registerCollision} />
        <Island registerCollision={registerCollision} />
        {interactables.map((def) => (
          <Interactable key={def.id} def={def} />
        ))}
      </group>
      <Avatar ref={avatarRef} />
    </>
  )
}
