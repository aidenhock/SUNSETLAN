import { useMemo } from 'react'
import * as THREE from 'three'
import { groundAltitudeAt } from '../controls/terrain'
import { facetTerrain } from './geometryUtils'
import {
  DOCK,
  MAP,
  PLANET_RADIUS,
  scatterProps,
  SINK_M,
  TERRAIN,
  terrainProfile,
} from './planetConfig'
import { IDENTITY_Q, InstancedProp, StaticInstances, surfacePartMatrix } from './instancing'
import {
  buildBigTree,
  buildCampfire,
  buildCrate,
  buildLogBench,
  buildPalapa,
  buildPalm,
  buildRock,
  buildRowboat,
  paletteMaterial,
  PROP_COLORS,
} from './props'

const woodMat = paletteMaterial(PROP_COLORS.woodDark)
const postGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.84, 5)
const shellMat = paletteMaterial('#f3e6c8')
const shellGeo = new THREE.ConeGeometry(0.16, 0.22, 5)

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** Placement matrix at a map spot: analytic ground − sink, meridian-aligned. */
const placement = (lat: number, long: number, yaw = 0, scale = 1) =>
  surfacePartMatrix(lat, long, groundAltitudeAt(lat, long) - SINK_M, yaw, V(0, 0, 0), IDENTITY_Q, scale)

/**
 * The island: jittered, vertex-tinted caps plus chunky primitive props built
 * in props.ts per the style bible — every prop instanced (one draw call per
 * material part) and placed from the world map table. Altitudes all derive
 * from groundAltitudeAt (rule 1); blocking radii live in planetConfig.
 */
export function Island() {
  // ONE continuous terrain surface (placement rule 4): the cap follows
  // terrainProfile and is painted by polar band — grass tiling on the
  // plateau, blended shoulder, sand tans to the waterline, wet sand on the
  // submerged apron. Per-face two-tone facets per playbook §3.
  const terrainGeo = useMemo(
    () =>
      facetTerrain(
        new THREE.SphereGeometry(
          PLANET_RADIUS, 96, 64, 0, Math.PI * 2, 0, THREE.MathUtils.degToRad(TERRAIN.apronEndDeg),
        ),
        {
          radiusAt: (polar) => PLANET_RADIUS + terrainProfile(polar),
          bands: [
            { untilPolarDeg: 65, colorA: '#58b268', colorB: '#49a15a', checker: 0.65 },
            { untilPolarDeg: TERRAIN.waterlineDeg, colorA: '#e8d5a3', colorB: '#d9c48e', checker: 0.25, bias: 0.6 },
            { untilPolarDeg: 90, colorA: '#c7ae83', colorB: '#b39a70', checker: 0.3, bias: 0.55 },
          ],
          patchSize: 8,
          speckle: 0.05,
          poleFadeRad: 0.28, // clean turf around spawn; character further out
          seed: 3,
        },
      ),
    [],
  )

  const props = useMemo(
    () => ({
      palm: buildPalm(),
      rock: buildRock(),
      campfire: buildCampfire(),
      bench: buildLogBench(),
      crate: buildCrate(),
      rowboat: buildRowboat(),
      palapa: buildPalapa(),
      tree: buildBigTree(),
    }),
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
      palapa: [placement(MAP.palapa.lat, MAP.palapa.long)],
      tree: [placement(MAP.tree.lat, MAP.tree.long)],
    }),
    [],
  )

  return (
    <>
      {/* The island surface — one continuous mesh, no rims, no undersides
          (the apron ends tucked under the ocean-floor sphere). */}
      <mesh geometry={terrainGeo}>
        <meshLambertMaterial vertexColors flatShading />
      </mesh>

      {/* Dock (primitive, instanced). */}
      <StaticInstances geometry={plankGeo} material={woodMat} matrices={dock.planks} />
      <StaticInstances geometry={postGeo} material={woodMat} matrices={dock.posts} />

      {/* Chunky scatter — one draw call per material part. */}
      <InstancedProp parts={props.palm} placements={scatter.palms} />
      <InstancedProp parts={props.rock} placements={scatter.rocks} />
      <StaticInstances geometry={shellGeo} material={shellMat} matrices={scatter.shells} />

      {/* Night beach: campfire + log bench. */}
      <InstancedProp parts={props.campfire} placements={single.campfire} />
      <InstancedProp parts={props.bench} placements={single.bench} />

      {/* CRT crate + beached rowboat. */}
      <InstancedProp parts={props.crate} placements={single.crate} />
      <InstancedProp parts={props.rowboat} placements={single.rowboat} />

      {/* Landmarks: palapa (Projects) and the big tree (About). */}
      <InstancedProp parts={props.palapa} placements={single.palapa} />
      <InstancedProp parts={props.tree} placements={single.tree} />
    </>
  )
}
