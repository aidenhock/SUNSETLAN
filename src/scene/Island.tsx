import * as THREE from 'three'
import type { RegisterCollision } from './SurfaceGroup'
import { SurfaceGroup } from './SurfaceGroup'
import {
  GRASS_POLAR_DEG,
  ISLAND_POLAR_DEG,
  PLANET_RADIUS,
  scatterProps,
} from './planetConfig'

const ISLAND_THETA = THREE.MathUtils.degToRad(ISLAND_POLAR_DEG)
const GRASS_THETA = THREE.MathUtils.degToRad(GRASS_POLAR_DEG)

/**
 * The island polar cap, blocked out with primitives. The sand and grass caps
 * double as the walkable collision meshes (they are low-poly primitives, not
 * scatter props — props are never raycast).
 */
export function Island({ registerCollision }: { registerCollision: RegisterCollision }) {
  return (
    <>
      {/* Beach: sand cap down to the water line. */}
      <mesh ref={registerCollision}>
        <sphereGeometry args={[PLANET_RADIUS + 0.35, 64, 32, 0, Math.PI * 2, 0, ISLAND_THETA]} />
        <meshStandardMaterial color="#e8d5a3" flatShading />
      </mesh>
      {/* Inner grass rise. */}
      <mesh ref={registerCollision}>
        <sphereGeometry args={[PLANET_RADIUS + 0.55, 48, 24, 0, Math.PI * 2, 0, GRASS_THETA]} />
        <meshStandardMaterial color="#55a05f" flatShading />
      </mesh>
      {/* Scatter blockout: palms and rocks (blocking radii live in planetConfig). */}
      {scatterProps.map((p, i) => (
        <SurfaceGroup key={i} lat={p.lat} long={p.long} altitude={0.55}>
          {p.kind === 'palm' ? (
            <group scale={p.scale}>
              <mesh position={[0, 1.1, 0]}>
                <cylinderGeometry args={[0.14, 0.22, 2.2, 6]} />
                <meshStandardMaterial color="#8a6f47" flatShading />
              </mesh>
              <mesh position={[0, 2.5, 0]}>
                <icosahedronGeometry args={[0.95, 0]} />
                <meshStandardMaterial color="#55a05f" flatShading />
              </mesh>
            </group>
          ) : (
            <mesh position={[0, 0.4 * p.scale, 0]} scale={p.scale}>
              <dodecahedronGeometry args={[0.8, 0]} />
              <meshStandardMaterial color="#b9b3a5" flatShading />
            </mesh>
          )}
        </SurfaceGroup>
      ))}
    </>
  )
}
