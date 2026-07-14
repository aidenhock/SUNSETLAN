import * as THREE from 'three'
import {
  GRASS_POLAR_DEG,
  ISLAND_POLAR_DEG,
  PLANET_RADIUS,
  scatterProps,
} from './planetConfig'
import type { RegisterCollision } from './SurfaceGroup'
import { SurfaceGroup } from './SurfaceGroup'

const ISLAND_THETA = THREE.MathUtils.degToRad(ISLAND_POLAR_DEG)
const GRASS_THETA = THREE.MathUtils.degToRad(GRASS_POLAR_DEG)

const wood = <meshStandardMaterial color="#8a6f47" flatShading />
const stone = <meshStandardMaterial color="#b9b3a5" flatShading />
const leaf = <meshStandardMaterial color="#55a05f" flatShading />

/**
 * The island polar cap, blocked out with primitives. The sand and grass caps
 * double as the walkable collision meshes (they are low-poly primitives, not
 * scatter props — props are never raycast). Blocking radii for the landmark
 * props live in planetConfig.landmarkBlockers.
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

      {/* Spawn beach: campfire + log bench (ukulele interactable sits beside). */}
      <SurfaceGroup lat={84} long={180} altitude={0.55}>
        <mesh position={[0, 0.3, 0]}>
          <coneGeometry args={[0.45, 0.9, 6]} />
          <meshStandardMaterial color="#ffb870" emissive="#ff8c42" emissiveIntensity={0.6} flatShading />
        </mesh>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh
            key={i}
            position={[Math.sin((i / 5) * Math.PI * 2) * 0.8, 0.12, Math.cos((i / 5) * Math.PI * 2) * 0.8]}
          >
            <dodecahedronGeometry args={[0.16, 0]} />
            {stone}
          </mesh>
        ))}
      </SurfaceGroup>
      <SurfaceGroup lat={83.5} long={186} altitude={0.55} yaw={0.6}>
        <mesh position={[0, 0.3, 0]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.28, 0.28, 2.2, 7]} />
          {wood}
        </mesh>
      </SurfaceGroup>

      {/* Wooden dock running toward the water line (walk-over, not blocked). */}
      <SurfaceGroup lat={18.5} long={90} altitude={0.6}>
        <mesh>
          <boxGeometry args={[2, 0.18, 11]} />
          {wood}
        </mesh>
        {[-4.5, -1.5, 1.5, 4.5].flatMap((z) =>
          [-0.85, 0.85].map((x) => (
            <mesh key={`${x}:${z}`} position={[x, -0.5, z]}>
              <cylinderGeometry args={[0.09, 0.09, 1.1, 5]} />
              {wood}
            </mesh>
          )),
        )}
      </SurfaceGroup>

      {/* Palapa: posts, thatch roof, desk (the monitor interactable sits on it). */}
      <SurfaceGroup lat={45} long={0} altitude={0.55}>
        {[-1.4, 1.4].flatMap((x) =>
          [-1.2, 1.2].map((z) => (
            <mesh key={`${x}:${z}`} position={[x, 1.2, z]}>
              <cylinderGeometry args={[0.1, 0.12, 2.4, 5]} />
              {wood}
            </mesh>
          )),
        )}
        <mesh position={[0, 2.6, 0]}>
          <coneGeometry args={[2.6, 1.1, 4]} />
          <meshStandardMaterial color="#d8c37e" flatShading />
        </mesh>
        <mesh position={[0.9, 0.45, 0]}>
          <boxGeometry args={[1.4, 0.9, 0.7]} />
          {wood}
        </mesh>
      </SurfaceGroup>

      {/* Grassy rise: one big tree with gymnastics rings on a branch. */}
      <SurfaceGroup lat={55} long={302.5} altitude={0.55}>
        <mesh position={[0, 1.6, 0]}>
          <cylinderGeometry args={[0.35, 0.5, 3.2, 7]} />
          {wood}
        </mesh>
        <mesh position={[0, 4, 0]}>
          <icosahedronGeometry args={[2.2, 0]} />
          {leaf}
        </mesh>
        <mesh position={[-1.1, 2.9, 0]} rotation-z={0.5}>
          <cylinderGeometry args={[0.12, 0.12, 1.6, 5]} />
          {wood}
        </mesh>
        {[-1.6, -1.2].map((x, i) => (
          <mesh key={i} position={[x, 2.1, 0]}>
            <torusGeometry args={[0.16, 0.035, 6, 12]} />
            {stone}
          </mesh>
        ))}
      </SurfaceGroup>

      {/* Old CRT TV on a crate near the rocks. */}
      <SurfaceGroup lat={35} long={135.8} altitude={0.35}>
        <mesh position={[0, 0.35, 0]}>
          <boxGeometry args={[0.9, 0.7, 0.9]} />
          {wood}
        </mesh>
      </SurfaceGroup>

      {/* Mailbox post at the dock entrance. */}
      <SurfaceGroup lat={24} long={91} altitude={0.35}>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 1, 5]} />
          {wood}
        </mesh>
      </SurfaceGroup>

      {/* Beached rowboat. */}
      <SurfaceGroup lat={20} long={200} altitude={0.35} yaw={0.9}>
        <mesh position={[0, 0.35, 0]} scale={[1, 0.55, 2.6]}>
          <dodecahedronGeometry args={[0.9, 0]} />
          <meshStandardMaterial color="#c96f4a" flatShading />
        </mesh>
      </SurfaceGroup>

      {/* Scatter blockout: palms and rocks. */}
      {scatterProps.map((p, i) => (
        <SurfaceGroup key={i} lat={p.lat} long={p.long} altitude={0.55}>
          {p.kind === 'palm' ? (
            <group scale={p.scale}>
              <mesh position={[0, 1.1, 0]}>
                <cylinderGeometry args={[0.14, 0.22, 2.2, 6]} />
                {wood}
              </mesh>
              <mesh position={[0, 2.5, 0]}>
                <icosahedronGeometry args={[0.95, 0]} />
                {leaf}
              </mesh>
            </group>
          ) : (
            <mesh position={[0, 0.4 * p.scale, 0]} scale={p.scale}>
              <dodecahedronGeometry args={[0.8, 0]} />
              {stone}
            </mesh>
          )}
        </SurfaceGroup>
      ))}
    </>
  )
}
