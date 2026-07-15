import { PLANET_RADIUS } from './planetConfig'

/**
 * Sphere-wrapping ocean at sea level. Wading depth comes from the analytic
 * ground height in usePlanetController. Cheap animated material comes in
 * phase 3.
 */
export function Water() {
  return (
    <mesh>
      <sphereGeometry args={[PLANET_RADIUS, 64, 32]} />
      <meshStandardMaterial color="#35a7a0" flatShading transparent opacity={0.92} />
    </mesh>
  )
}
