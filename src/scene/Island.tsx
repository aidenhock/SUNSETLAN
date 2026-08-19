import { useMemo } from 'react'
import * as THREE from 'three'
import { latLongToUnit } from '../controls/planetMath'
import { groundAltitudeAt } from '../controls/terrain'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { bakeWarmTintToward, facetTerrain } from './geometryUtils'
import {
  DOCK,
  MAP,
  PLANET_RADIUS,
  SINK_M,
  TERRAIN,
  terrainProfile,
} from './planetConfig'
import { IDENTITY_Q, InstancedProp, surfacePartMatrix } from './instancing'
import {
  buildCemetery,
  paletteMaterial,
  PROP_COLORS,
  type PropPart,
} from './props'
import { usePlacementRuntime } from './placementRuntime'
import { PROP_REGISTRY } from './propRegistry'
import { buildSignpost, SIGNPOST_TARGETS } from './signpost'

const woodMat = paletteMaterial(PROP_COLORS.woodDark)
const postGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.84, 5)

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

  // Every registered prop type, built once. Which of them appear and
  // where comes from the placement list below, not from this map.
  const props = useMemo<Record<string, PropPart[]>>(
    () => Object.fromEntries(Object.entries(PROP_REGISTRY).map(([k, build]) => [k, build()])),
    [],
  )

  // The cemetery is a whole structure wrapped onto the sphere, so it is
  // rebuilt from wherever its placement now sits rather than placed by
  // a matrix. Keyed on the plot's own numbers: it re-merges when the
  // editor drops it somewhere new, not every frame of the drag.
  const cemPlot = usePlacementRuntime((s) => s.list.find((p) => p.id === 'cemetery'))
  const dragging = usePlacementRuntime((s) => s.isDragging)
  const cemKey = dragging
    ? 'dragging'
    : `${cemPlot?.lat},${cemPlot?.long},${cemPlot?.yawDeg},${cemPlot?.size?.widthM},${cemPlot?.size?.depthM}`
  const cemetery = useMemo(
    () => (cemPlot ? buildCemetery(cemPlot) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cemKey],
  )

  // Placements, grouped by type into one instanced draw each. Reading
  // the runtime list (rather than the file) is what lets the dev editor
  // move things and see it immediately; in production the list is the
  // file and never changes.
  const live = usePlacementRuntime((s) => s.list)
  // The signpost letters itself from the world: its planks point at
  // landmarks and carry their distances, so it rebuilds when it or any
  // of them moves — keyed on those numbers, not on every frame.
  const signKey = live
    .filter((p) => p.id === 'signpost' || SIGNPOST_TARGETS.some((t) => t.id === p.id))
    .map((p) => `${p.id}:${p.lat.toFixed(3)},${p.long.toFixed(3)}`)
    .join('|')
  const signpost = useMemo(() => {
    const post = live.find((p) => p.id === 'signpost')
    return post ? buildSignpost(post, live) : []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signKey])
  const signAt = useMemo(() => {
    const post = live.find((p) => p.id === 'signpost')
    return post ? placement(post.lat, post.long, (post.yawDeg * Math.PI) / 180, post.scale) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signKey])

  const groups = useMemo(() => {
    const out: Record<string, THREE.Matrix4[]> = {}
    for (const p of live) {
      if (!(p.type in PROP_REGISTRY)) continue
      ;(out[p.type] ??= []).push(
        placement(p.lat, p.long, (p.yawDeg * Math.PI) / 180, p.scale),
      )
    }
    return out
  }, [live])

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

  // Draw-call shave: the dock is fully static, so planks + posts fuse
  // into ONE wood mesh instead of two instanced draws.
  const dockGeo = useMemo(() => {
    const strip = (g: THREE.BufferGeometry, m: THREE.Matrix4) => {
      const n = g.index ? g.toNonIndexed() : g.clone()
      n.deleteAttribute('uv')
      n.applyMatrix4(m)
      return n
    }
    const parts: THREE.BufferGeometry[] = []
    for (const m of dock.planks) parts.push(strip(plankGeo, m))
    for (const m of dock.posts) parts.push(strip(postGeo, m))
    const merged = mergeGeometries(parts)
    parts.forEach((p) => p.dispose())
    return merged
  }, [dock, plankGeo])

  // The seating logs are FIRE FURNITURE (campfire fix): one merged
  // vertex-tinted mesh — proper bark + lighter end-grain caps — with a
  // warm tint BAKED toward the fire heart, distance-scaled, so their
  // fire-facing sides read warm-lit even where the point light thins
  // (Lambert diffuse alone left them black; the shared instanced
  // palette material could never carry a per-log bake). Geometry
  // matches buildLogBench exactly — the sit system's log-top math
  // (seats.ts) must keep agreeing with the rendered wood.
  const seatingLogs = useMemo(() => {
    const fireAlt = groundAltitudeAt(MAP.campfire.lat, MAP.campfire.long) - SINK_M + 0.45
    const firePoint = latLongToUnit(MAP.campfire.lat, MAP.campfire.long).multiplyScalar(
      PLANET_RADIUS + fireAlt,
    )
    const parts: THREE.BufferGeometry[] = []
    const bake = (g: THREE.BufferGeometry, m: THREE.Matrix4, base: string, warm: string) => {
      g.applyMatrix4(m)
      const baked = bakeWarmTintToward(g, firePoint, base, warm, {
        ambient: 0.08,
        nearM: 2.0,
        farM: 4.6,
        facingMin: 0.25,
        facingMax: 0.85,
      })
      g.dispose()
      baked.deleteAttribute('uv')
      parts.push(baked)
    }
    for (const l of MAP.logs) {
      const m = placement(l.lat, l.long, l.yaw)
      bake(
        new THREE.CylinderGeometry(0.26, 0.26, 2.0, 7).rotateZ(Math.PI / 2).translate(0, 0.26, 0),
        m,
        '#96714a',
        '#f2a55e',
      )
      for (const x of [1.0, -1.0]) {
        bake(
          new THREE.CylinderGeometry(0.27, 0.27, 0.03, 7).rotateZ(Math.PI / 2).translate(x, 0.26, 0),
          m,
          '#c99e6a',
          '#f6c088',
        )
      }
    }
    const merged = mergeGeometries(parts)
    parts.forEach((p) => p.dispose())
    return merged
  }, [])

  return (
    <>
      {/* The island surface — one continuous mesh, no rims, no undersides
          (the apron ends tucked under the ocean-floor sphere). */}
      <mesh geometry={terrainGeo}>
        <meshLambertMaterial vertexColors flatShading />
      </mesh>

      {/* Dock — one merged static wood mesh (draw-call shave). */}
      <mesh geometry={dockGeo} material={woodMat} />

      {/* Chunky scatter — one draw call per material part. */}
      {/* The signpost: post and lettered planks. */}
      {signAt &&
        signpost.map((part, i) => (
          <InstancedProp key={`sign-${i}`} parts={[part]} placements={[signAt]} />
        ))}

      {/* One instanced draw per prop type, straight from the placements. */}
      {Object.entries(groups).map(([type, matrices]) => (
        <InstancedProp key={type} parts={props[type]} placements={matrices} />
      ))}

      {/* Night beach: the three sittable logs, fire-lit (the fire itself —
          flame, teepee wood, stone ring — is the animated <Fire> component). */}
      <mesh geometry={seatingLogs}>
        <meshLambertMaterial vertexColors flatShading />
      </mesh>

      {/* Memorial garden statics (fireflies + glow live in <Cemetery/>).
          buildCemetery returns ONE part already wrapped onto the sphere
          (placement rule 2 — a 17 m fence sags as a flat mesh), so it
          renders as a plain mesh with no placement transform. */}
      <mesh geometry={cemetery[0].geometry} material={cemetery[0].material} />

      {/* CRT crate + beached rowboat. */}

      {/* Landmark: the palapa (Projects). The About hedge stone renders
          as its interactable's own prop body. */}
    </>
  )
}
