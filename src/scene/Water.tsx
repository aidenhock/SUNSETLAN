import type { RegisterCollision } from './SurfaceGroup'
import { PLANET_RADIUS } from './planetConfig'

/**
 * Sphere-wrapping ocean at sea level. Registered as collision so wading past
 * the beach line stands the avatar ankle-deep instead of falling through.
 * Cheap animated material comes in phase 3.
 */
export function Water({ registerCollision }: { registerCollision: RegisterCollision }) {
  return (
    <mesh ref={registerCollision}>
      <sphereGeometry args={[PLANET_RADIUS, 64, 32]} />
      <meshStandardMaterial color="#35a7a0" flatShading transparent opacity={0.92} />
    </mesh>
  )
}
