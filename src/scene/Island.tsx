import { useGLTF } from '@react-three/drei'
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
  SINK_M,
} from './planetConfig'
import { DRACO_PATH, IDENTITY_Q, InstancedModel, StaticInstances, surfacePartMatrix } from './instancing'
import { SurfaceGroup } from './SurfaceGroup'

const ISLAND_THETA = THREE.MathUtils.degToRad(ISLAND_POLAR_DEG)
const GRASS_THETA = THREE.MathUtils.degToRad(GRASS_POLAR_DEG)

// Dock stays primitive: no kit part matches the analytic strip exactly
// (CLAUDE.md sanctions code-built as the fallback).
const woodMat = new THREE.MeshStandardMaterial({ color: '#8a6f47', flatShading: true })
const postGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.84, 5)
const shellMat = new THREE.MeshStandardMaterial({ color: '#f3e6c8', flatShading: true })
const shellGeo = new THREE.ConeGeometry(0.16, 0.22, 5)

const wood = <meshStandardMaterial color="#8a6f47" flatShading />
const stone = <meshStandardMaterial color="#b9b3a5" flatShading />
const leaf = <meshStandardMaterial color="#55a05f" flatShading />

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** Placement matrix at a map spot: analytic ground − sink, meridian-aligned. */
const placement = (lat: number, long: number, yaw = 0, scale = 1) =>
  surfacePartMatrix(lat, long, groundAltitudeAt(lat, long) - SINK_M, yaw, V(0, 0, 0), IDENTITY_Q, scale)

/**
 * The island: jittered, vertex-tinted caps, kit-part landmarks and scatter
 * from the world map table (instanced — one draw call per mesh primitive),
 * and primitive fallbacks for the dock, palapa, and big tree. Altitudes all
 * derive from groundAltitudeAt (rule 1); blocking radii live in planetConfig.
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

  const scatter = useMemo(() => {
    const palms: THREE.Matrix4[] = []
    const rocks: THREE.Matrix4[] = []
    const shells: THREE.Matrix4[] = []
    scatterProps.forEach((p, i) => {
      const yaw = (i * 137.5) % 6.28
      const m = placement(p.lat, p.long, yaw, p.scale)
      if (p.kind === 'palm') palms.push(m)
      else if (p.kind === 'rock') rocks.push(m)
      else shells.push(m)
    })
    return { palms, rocks, shells }
  }, [])

  const dock = useMemo(() => {
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
    return { planks, posts }
  }, [])

  const plankGeo = useMemo(() => {
    const segLatSpan = (DOCK.latMaxDeg - DOCK.latMinDeg) / DOCK.segmentCount
    const segLengthM = THREE.MathUtils.degToRad(segLatSpan) * PLANET_RADIUS + 0.12
    return new THREE.BoxGeometry(DOCK.halfWidthM * 2, DOCK.plankThicknessM, segLengthM)
  }, [])

  const single = useMemo(
    () => ({
      campfire: [placement(MAP.campfire.lat, MAP.campfire.long)],
      bench: [placement(MAP.bench.lat, MAP.bench.long, -0.9)],
      crate: [placement(MAP.tv.lat, MAP.tv.long + 0.8)],
      rowboat: [placement(MAP.rowboat.lat, MAP.rowboat.long, 0.9)],
    }),
    [],
  )

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

      {/* Dock (primitive fallback, instanced). */}
      <StaticInstances geometry={plankGeo} material={woodMat} matrices={dock.planks} />
      <StaticInstances geometry={postGeo} material={woodMat} matrices={dock.posts} />

      {/* Kit-part scatter — one draw call per mesh primitive. */}
      <InstancedModel url="/models/palm.glb" targetSize={3.6} placements={scatter.palms} />
      <InstancedModel url="/models/rock.glb" targetSize={0.9} placements={scatter.rocks} />
      {/* Shells stay primitive: a 20-tri cone beats a 1.4k-tri kit model that
          reads identically at this size (software-rendering budget). */}
      <StaticInstances geometry={shellGeo} material={shellMat} matrices={scatter.shells} />

      {/* Night beach: kit campfire (it brings its own flame) + kit log bench. */}
      <InstancedModel url="/models/campfire.glb" targetSize={1.3} axis="x" placements={single.campfire} />
      <InstancedModel url="/models/log.glb" targetSize={2.0} axis="x" placements={single.bench} />

      {/* CRT crate + beached rowboat from the kits. */}
      <InstancedModel url="/models/crate.glb" targetSize={0.9} placements={single.crate} />
      <InstancedModel url="/models/rowboat.glb" targetSize={2.8} axis="z" placements={single.rowboat} />

      {/* Palapa: posts, thatch roof, desk (primitive fallback). */}
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

      {/* Grassy rise: big tree + rings (primitive fallback). */}
      <SurfaceGroup lat={MAP.tree.lat} long={MAP.tree.long}>
        <mesh position={[0, 1.7, 0]}>
          <cylinderGeometry args={[0.35, 0.5, 3.4, 7]} />
          {wood}
        </mesh>
        <mesh position={[0, 4.1, 0]}>
          <icosahedronGeometry args={[2.2, 0]} />
          {leaf}
        </mesh>
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
    </>
  )
}

useGLTF.preload('/models/palm.glb', DRACO_PATH)
useGLTF.preload('/models/rock.glb', DRACO_PATH)
useGLTF.preload('/models/campfire.glb', DRACO_PATH)
useGLTF.preload('/models/log.glb', DRACO_PATH)
useGLTF.preload('/models/crate.glb', DRACO_PATH)
useGLTF.preload('/models/rowboat.glb', DRACO_PATH)
