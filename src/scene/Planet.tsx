import { useRef } from 'react'
import * as THREE from 'three'
import { usePlanetController } from '../controls/usePlanetController'
import { usePointerLockCamera } from '../controls/usePointerLockCamera'
import { interactables } from '../content/interactables'
import { Avatar } from './Avatar'
import { CelestialDome } from './CelestialDome'
import { Interactable } from './Interactable'
import { Island } from './Island'
import { PLANET_RADIUS } from './planetConfig'
import { SkyRig } from './SkyRig'
import { WadeRipple } from './WadeRipple'
import { Water } from './Water'

/**
 * The whole rotating world. One group owns the planet quaternion; the avatar
 * stays fixed at the pole. Ground height is analytic (see groundHeightAt in
 * usePlanetController) — nothing here is raycast. The touch joystick is a DOM
 * overlay owned by App.
 */
export function PlanetScene({ isTouch }: { isTouch: boolean }) {
  const planetRef = useRef<THREE.Group>(null)
  const avatarRef = useRef<THREE.Group>(null)

  usePlanetController({ planetRef, avatarRef })
  usePointerLockCamera({ avatarRef, isTouch })

  return (
    <>
      <SkyRig planetRef={planetRef} />
      <group ref={planetRef}>
        {/* Planet-local sky: the split dome, sun, moon, and stars rotate with
            the world — that is what makes the two moods permanent. */}
        <CelestialDome />
        {/* Ocean floor — the planet body under the water shell. */}
        <mesh>
          <sphereGeometry args={[PLANET_RADIUS - 0.4, 48, 24]} />
          <meshLambertMaterial color="#16565b" flatShading />
        </mesh>
        <Water />
        <Island />
        {interactables.map((def) => (
          <Interactable key={def.id} def={def} />
        ))}
      </group>
      <Avatar ref={avatarRef} />
      <WadeRipple />
    </>
  )
}
