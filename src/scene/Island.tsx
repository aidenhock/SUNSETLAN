import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { latLongToUnit, meridianYaw, surfaceQuaternion, WORLD_UP } from '../controls/planetMath'
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
  SINK_M,
} from './planetConfig'
import { SurfaceGroup } from './SurfaceGroup'

const ISLAND_THETA = THREE.MathUtils.degToRad(ISLAND_POLAR_DEG)
const GRASS_THETA = THREE.MathUtils.degToRad(GRASS_POLAR_DEG)

// Shared materials/geometries for the instanced repeats (created once).
const woodMat = new THREE.MeshStandardMaterial({ color: '#8a6f47', flatShading: true })
const stoneMat = new THREE.MeshStandardMaterial({ color: '#b9b3a5', flatShading: true })
const leafMat = new THREE.MeshStandardMaterial({ color: '#55a05f', flatShading: true })
const shellMat = new THREE.MeshStandardMaterial({ color: '#f3e6c8', flatShading: true })
const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 2.4, 6)
const crownGeo = new THREE.IcosahedronGeometry(0.95, 0)
const rockGeo = new THREE.DodecahedronGeometry(0.8, 0)
const shellGeo = new THREE.ConeGeometry(0.16, 0.22, 5)
const postGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.84, 5)
const fireStoneGeo = new THREE.DodecahedronGeometry(0.16, 0)

const wood = <meshStandardMaterial color="#8a6f47" flatShading />
const stone = <meshStandardMaterial color="#b9b3a5" flatShading />
const leaf = <meshStandardMaterial color="#55a05f" flatShading />

/** World matrix for a part placed on the sphere (SurfaceGroup, but baked). */
function surfacePartMatrix(
  lat: number,
  long: number,
  altitude: number,
  yaw: number,
  localPos: THREE.Vector3,
  localQuat: THREE.Quaternion,
  scale: number,
): THREE.Matrix4 {
  const unit = latLongToUnit(lat, long)
  const q = surfaceQuaternion(unit).multiply(
    new THREE.Quaternion().setFromAxisAngle(WORLD_UP, meridianYaw(lat, long) + yaw),
  )
  const surface = new THREE.Matrix4().compose(
    unit.clone().multiplyScalar(PLANET_RADIUS + altitude),
    q,
    new THREE.Vector3(1, 1, 1),
  )
  const local = new THREE.Matrix4().compose(
    localPos,
    localQuat,
    new THREE.Vector3(scale, scale, scale),
  )
  return surface.multiply(local)
}

/** One draw call for a repeated mesh; matrices are baked once at mount. */
function StaticInstances({
  geometry,
  material,
  matrices,
}: {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  matrices: THREE.Matrix4[]
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [matrices])
  return <instancedMesh ref={meshRef} args={[geometry, material, matrices.length]} />
}

const IDENTITY_Q = new THREE.Quaternion()
const SHELL_TILT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.4)
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/**
 * The island: jittered, vertex-tinted caps, every landmark from the world
 * map table, and instanced repeats (palms/rocks/shells/dock/stones — one
 * draw call each). Altitudes all derive from groundAltitudeAt (rule 1);
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

  const inst = useMemo(() => {
    const trunks: THREE.Matrix4[] = []
    const crowns: THREE.Matrix4[] = []
    const rocks: THREE.Matrix4[] = []
    const shells: THREE.Matrix4[] = []
    scatterProps.forEach((p, i) => {
      const alt = groundAltitudeAt(p.lat, p.long) - SINK_M
      const yaw = (i * 137.5) % 6.28
      if (p.kind === 'palm') {
        trunks.push(surfacePartMatrix(p.lat, p.long, alt, yaw, V(0, 1.2 * p.scale, 0), IDENTITY_Q, p.scale))
        crowns.push(surfacePartMatrix(p.lat, p.long, alt, yaw, V(0, 2.7 * p.scale, 0), IDENTITY_Q, p.scale))
      } else if (p.kind === 'rock') {
        rocks.push(surfacePartMatrix(p.lat, p.long, alt, yaw, V(0, 0.4 * p.scale, 0), IDENTITY_Q, p.scale))
      } else {
        shells.push(surfacePartMatrix(p.lat, p.long, alt, yaw, V(0, 0.12, 0), SHELL_TILT, p.scale))
      }
    })

    // Dock: plank segments + posts, snapped per segment (rule 2).
    const planks: THREE.Matrix4[] = []
    const posts: THREE.Matrix4[] = []
    const latSpan = DOCK.latMaxDeg - DOCK.latMinDeg
    const segLatSpan = latSpan / DOCK.segmentCount
    for (let i = 0; i < DOCK.segmentCount; i++) {
      const lat = DOCK.latMaxDeg - segLatSpan * (i + 0.5)
      const altitude = groundAltitudeAt(lat, DOCK.longDeg) - DOCK.plankThicknessM / 2
      planks.push(surfacePartMatrix(lat, DOCK.longDeg, altitude, 0, V(0, 0, 0), IDENTITY_Q, 1))
      for (const x of [-0.8, 0.8]) {
        posts.push(surfacePartMatrix(lat, DOCK.longDeg, altitude, 0, V(x, -0.42, 0), IDENTITY_Q, 1))
      }
    }

    // Campfire stone ring.
    const fireStones: THREE.Matrix4[] = []
    const fireAlt = groundAltitudeAt(MAP.campfire.lat, MAP.campfire.long) - SINK_M
    for (let i = 0; i < 5; i++) {
      fireStones.push(
        surfacePartMatrix(
          MAP.campfire.lat, MAP.campfire.long, fireAlt, 0,
          V(Math.sin((i / 5) * Math.PI * 2) * 0.8, 0.16, Math.cos((i / 5) * Math.PI * 2) * 0.8),
          IDENTITY_Q, 1,
        ),
      )
    }
    return { trunks, crowns, rocks, shells, planks, posts, fireStones }
  }, [])

  const plankGeo = useMemo(() => {
    const segLatSpan = (DOCK.latMaxDeg - DOCK.latMinDeg) / DOCK.segmentCount
    const segLengthM = THREE.MathUtils.degToRad(segLatSpan) * PLANET_RADIUS + 0.12
    return new THREE.BoxGeometry(DOCK.halfWidthM * 2, DOCK.plankThicknessM, segLengthM)
  }, [])

  return (
    <>
      {/* Beach: sand cap down to the water line. DoubleSide closes the open
          rim edge that is visible from the wade zone past the beach line. */}
      <mesh geometry={sandGeo}>
        <meshStandardMaterial vertexColors flatShading side={THREE.DoubleSide} />
      </mesh>
      {/* Inner grass rise. */}
      <mesh geometry={grassGeo}>
        <meshStandardMaterial vertexColors flatShading />
      </mesh>

      {/* Instanced repeats — one draw call per kind. */}
      <StaticInstances geometry={plankGeo} material={woodMat} matrices={inst.planks} />
      <StaticInstances geometry={postGeo} material={woodMat} matrices={inst.posts} />
      <StaticInstances geometry={trunkGeo} material={woodMat} matrices={inst.trunks} />
      <StaticInstances geometry={crownGeo} material={leafMat} matrices={inst.crowns} />
      <StaticInstances geometry={rockGeo} material={stoneMat} matrices={inst.rocks} />
      <StaticInstances geometry={shellGeo} material={shellMat} matrices={inst.shells} />
      <StaticInstances geometry={fireStoneGeo} material={stoneMat} matrices={inst.fireStones} />

      {/* Night beach: campfire flame + log bench (fire light/crackle in 3B/3C). */}
      <SurfaceGroup lat={MAP.campfire.lat} long={MAP.campfire.long}>
        <mesh position={[0, 0.42, 0]}>
          <coneGeometry args={[0.45, 0.9, 6]} />
          <meshStandardMaterial color="#ffb870" emissive="#ff8c42" emissiveIntensity={0.6} flatShading />
        </mesh>
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
    </>
  )
}
