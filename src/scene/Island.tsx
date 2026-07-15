import { useMemo } from 'react'
import * as THREE from 'three'
import { groundAltitudeAt } from '../controls/terrain'
import { jitterAndTint } from './geometryUtils'
import {
  DOCK,
  GRASS_ALTITUDE,
  GRASS_POLAR_DEG,
  ISLAND_POLAR_DEG,
  MAP,
  PLANET_RADIUS,
  SAND_ALTITUDE,
  scatterProps,
} from './planetConfig'
import { SurfaceGroup } from './SurfaceGroup'

const ISLAND_THETA = THREE.MathUtils.degToRad(ISLAND_POLAR_DEG)
const GRASS_THETA = THREE.MathUtils.degToRad(GRASS_POLAR_DEG)

const wood = <meshStandardMaterial color="#8a6f47" flatShading />
const stone = <meshStandardMaterial color="#b9b3a5" flatShading />
const leaf = <meshStandardMaterial color="#55a05f" flatShading />

/** Segmented dock: short surface-snapped planks, never a long chord. */
function Dock() {
  const segments = useMemo(() => {
    const latSpan = DOCK.latMaxDeg - DOCK.latMinDeg
    const segLatSpan = latSpan / DOCK.segmentCount
    const segLengthM = (THREE.MathUtils.degToRad(segLatSpan) * PLANET_RADIUS) + 0.12 // slight overlap hides seams
    return Array.from({ length: DOCK.segmentCount }, (_, i) => {
      const lat = DOCK.latMaxDeg - segLatSpan * (i + 0.5)
      return {
        lat,
        segLengthM,
        // Plank center sits half a thickness under the walkable deck height,
        // so the analytic ground and the visual top are the same surface.
        altitude: groundAltitudeAt(lat, DOCK.longDeg) - DOCK.plankThicknessM / 2,
      }
    })
  }, [])
  return (
    <>
      {segments.map((seg, i) => (
        <SurfaceGroup key={i} lat={seg.lat} long={DOCK.longDeg} altitude={seg.altitude}>
          <mesh>
            <boxGeometry args={[DOCK.halfWidthM * 2, DOCK.plankThicknessM, seg.segLengthM]} />
            {wood}
          </mesh>
          {[-0.8, 0.8].map((x) => (
            <mesh key={x} position={[x, -0.42, 0]}>
              <cylinderGeometry args={[0.09, 0.09, 0.84, 5]} />
              {wood}
            </mesh>
          ))}
        </SurfaceGroup>
      ))}
    </>
  )
}

/**
 * The island: jittered, vertex-tinted caps plus every landmark from the
 * world map table. Altitudes all derive from groundAltitudeAt (rule 1);
 * blocking radii live in planetConfig.
 */
export function Island() {
  const sandGeo = useMemo(
    () =>
      jitterAndTint(
        new THREE.SphereGeometry(
          PLANET_RADIUS + SAND_ALTITUDE, 96, 48, 0, Math.PI * 2, 0, ISLAND_THETA,
        ),
        { baseColor: '#e8d5a3', patchColor: '#ddc994', patchSize: 6, patchStrength: 0.4, speckle: 0.04 },
      ),
    [],
  )
  const grassGeo = useMemo(
    () =>
      jitterAndTint(
        new THREE.SphereGeometry(
          PLANET_RADIUS + GRASS_ALTITUDE, 96, 48, 0, Math.PI * 2, 0, GRASS_THETA,
        ),
        {
          baseColor: '#55a05f',
          patchColor: '#4c9a63',
          patchSize: 11,
          patchStrength: 0.35,
          speckle: 0.03,
          poleFadeRad: 0.28, // clean turf around spawn; character further out
        },
      ),
    [],
  )

  return (
    <>
      <mesh geometry={sandGeo}>
        <meshStandardMaterial vertexColors flatShading side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={grassGeo}>
        <meshStandardMaterial vertexColors flatShading />
      </mesh>

      <Dock />

      {/* Night beach: campfire ring + log bench (fire light/crackle in 3B/3C). */}
      <SurfaceGroup lat={MAP.campfire.lat} long={MAP.campfire.long}>
        <mesh position={[0, 0.42, 0]}>
          <coneGeometry args={[0.45, 0.9, 6]} />
          <meshStandardMaterial color="#ffb870" emissive="#ff8c42" emissiveIntensity={0.6} flatShading />
        </mesh>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh
            key={i}
            position={[Math.sin((i / 5) * Math.PI * 2) * 0.8, 0.16, Math.cos((i / 5) * Math.PI * 2) * 0.8]}
          >
            <dodecahedronGeometry args={[0.16, 0]} />
            {stone}
          </mesh>
        ))}
      </SurfaceGroup>
      <SurfaceGroup lat={MAP.bench.lat} long={MAP.bench.long} yaw={-0.9}>
        <mesh position={[0, 0.36, 0]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.28, 0.28, 2.2, 7]} />
          {wood}
        </mesh>
      </SurfaceGroup>

      {/* Palapa: posts, thatch roof, desk (Projects monitor sits beside). */}
      <SurfaceGroup lat={MAP.palapa.lat} long={MAP.palapa.long}>
        {[-1.4, 1.4].flatMap((x) =>
          [-1.2, 1.2].map((z) => (
            <mesh key={`${x}:${z}`} position={[x, 1.2, z]}>
              <cylinderGeometry args={[0.1, 0.12, 2.6, 5]} />
              {wood}
            </mesh>
          )),
        )}
        <mesh position={[0, 2.7, 0]}>
          <coneGeometry args={[2.6, 1.1, 4]} />
          <meshStandardMaterial color="#d8c37e" flatShading />
        </mesh>
        <mesh position={[-1.6, 0.55, 0]}>
          <boxGeometry args={[1.4, 0.9, 0.7]} />
          {wood}
        </mesh>
      </SurfaceGroup>

      {/* Grassy rise: one big tree with gymnastics rings on a branch. */}
      <SurfaceGroup lat={MAP.tree.lat} long={MAP.tree.long}>
        <mesh position={[0, 1.7, 0]}>
          <cylinderGeometry args={[0.35, 0.5, 3.4, 7]} />
          {wood}
        </mesh>
        <mesh position={[0, 4.1, 0]}>
          <icosahedronGeometry args={[2.2, 0]} />
          {leaf}
        </mesh>
        {/* Branch long enough to clear the canopy; rings hang from its tip. */}
        <mesh position={[-1.5, 2.9, 0]} rotation-z={0.8}>
          <cylinderGeometry args={[0.12, 0.12, 2.1, 5]} />
          {wood}
        </mesh>
        {[-2.2, -1.8].map((x, i) => (
          <mesh key={i} position={[x, 2.35, 0]}>
            <torusGeometry args={[0.16, 0.035, 6, 12]} />
            {stone}
          </mesh>
        ))}
      </SurfaceGroup>

      {/* Old CRT TV's crate near the rocks (the TV box is the interactable). */}
      <SurfaceGroup lat={MAP.tv.lat} long={MAP.tv.long + 0.8}>
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[0.9, 0.7, 0.9]} />
          {wood}
        </mesh>
      </SurfaceGroup>

      {/* (The Contact cube at the dock entrance IS the mailbox placeholder —
          a decorative post would just poke through it until real props land.) */}

      {/* Beached rowboat. */}
      <SurfaceGroup lat={MAP.rowboat.lat} long={MAP.rowboat.long} yaw={0.9}>
        <mesh position={[0, 0.42, 0]} scale={[1, 0.55, 2.6]}>
          <dodecahedronGeometry args={[0.9, 0]} />
          <meshStandardMaterial color="#c96f4a" flatShading />
        </mesh>
      </SurfaceGroup>

      {/* Scatter: palms and rocks block (radii in planetConfig); shells don't. */}
      {scatterProps.map((p, i) => (
        <SurfaceGroup key={i} lat={p.lat} long={p.long} yaw={(i * 137.5) % 6.28}>
          {p.kind === 'palm' ? (
            <group scale={p.scale}>
              <mesh position={[0, 1.2, 0]}>
                <cylinderGeometry args={[0.14, 0.22, 2.4, 6]} />
                {wood}
              </mesh>
              <mesh position={[0, 2.7, 0]}>
                <icosahedronGeometry args={[0.95, 0]} />
                {leaf}
              </mesh>
            </group>
          ) : p.kind === 'rock' ? (
            <mesh position={[0, 0.4 * p.scale, 0]} scale={p.scale}>
              <dodecahedronGeometry args={[0.8, 0]} />
              {stone}
            </mesh>
          ) : (
            <mesh position={[0, 0.12, 0]} scale={p.scale} rotation-x={-0.4}>
              <coneGeometry args={[0.16, 0.22, 5]} />
              <meshStandardMaterial color="#f3e6c8" flatShading />
            </mesh>
          )}
        </SurfaceGroup>
      ))}
    </>
  )
}
