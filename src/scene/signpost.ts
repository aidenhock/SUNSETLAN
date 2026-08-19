import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Placement } from '../content/placements'
import { latLongToUnit } from '../controls/planetMath'
import { tintGeometry } from './geometryUtils'
import { PLANET_RADIUS } from './planetConfig'
import { normalizeForMerge, PROP_COLORS, type PropPart } from './props'

/**
 * The signpost at spawn: a post with a plank per landmark, each turned
 * to point at the thing it names and lettered with how far away it is.
 *
 * Both numbers come from the placement file, so the sign can never lie
 * about the world — move the campfire in the editor and its plank swings
 * round and re-letters itself. Text is drawn into a canvas at build time
 * (playbook §3's generated-tile allowance), one atlas row per plank, so
 * every plank shares one texture and one draw call.
 */

/** Which landmarks get a plank, and what to call them. */
export const SIGNPOST_TARGETS: Array<{ id: string; label: string }> = [
  { id: 'photos', label: 'THE DOCK' },
  { id: 'projects', label: 'THE PALAPA' },
  { id: 'campfire', label: 'THE CAMPFIRE' },
  { id: 'about', label: 'THE STONE' },
  { id: 'cemetery', label: 'THE GARDEN' },
  { id: 'rift', label: 'THE RIFT' },
]

const PLANK_W = 1.15
const PLANK_H = 0.24
const ROW_PX = 64
const ATLAS_W = 512

/** Great-circle metres between two placements. */
export function metresBetween(a: { lat: number; long: number }, b: { lat: number; long: number }) {
  return latLongToUnit(a.lat, a.long).angleTo(latLongToUnit(b.lat, b.long)) * PLANET_RADIUS
}

/**
 * Bearing from `from` to `to`, in radians from local north (positive
 * east) — the direction you would walk, which is exactly the yaw a
 * plank needs once meridianYaw has aligned the post.
 */
export function bearingBetween(
  from: { lat: number; long: number },
  to: { lat: number; long: number },
): number {
  const p = latLongToUnit(from.lat, from.long)
  const t = latLongToUnit(to.lat, to.long)
  const polar = ((90 - from.lat) * Math.PI) / 180
  const longRad = (from.long * Math.PI) / 180
  const north = new THREE.Vector3(
    -Math.cos(polar) * Math.sin(longRad),
    Math.sin(polar),
    -Math.cos(polar) * Math.cos(longRad),
  ).normalize()
  const east = new THREE.Vector3().crossVectors(north, p).normalize()
  const dir = t.clone().addScaledVector(p, -p.dot(t))
  if (dir.lengthSq() < 1e-12) return 0
  dir.normalize()
  return Math.atan2(dir.dot(east), dir.dot(north))
}

function lettering(rows: string[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = ATLAS_W
  canvas.height = ROW_PX * Math.max(1, rows.length)
  const ctx = canvas.getContext('2d')!
  rows.forEach((text, i) => {
    const y = i * ROW_PX
    ctx.fillStyle = '#c9a266' // the plank itself
    ctx.fillRect(0, y, ATLAS_W, ROW_PX)
    ctx.fillStyle = 'rgba(0,0,0,0.10)'
    ctx.fillRect(0, y + ROW_PX - 6, ATLAS_W, 6)
    ctx.fillStyle = '#3b2b18'
    ctx.font = `700 ${Math.floor(ROW_PX * 0.44)}px ui-sans-serif, system-ui, sans-serif`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText(text, 18, y + ROW_PX / 2)
  })
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/**
 * Build the sign for a post standing at `from`, pointing at whichever
 * of `targets` exist in `list`.
 */
export function buildSignpost(
  from: { lat: number; long: number },
  list: Placement[],
): PropPart[] {
  const found = SIGNPOST_TARGETS.map((t) => ({
    ...t,
    place: list.find((p) => p.id === t.id),
  })).filter((t) => t.place)

  // The post: one chunky column, plus a cap so it reads as finished.
  const postParts = [
    tintGeometry(
      normalizeForMerge(new THREE.CylinderGeometry(0.075, 0.09, 2.1, 6)),
      PROP_COLORS.woodDark,
    ).translate(0, 1.05, 0),
    tintGeometry(
      normalizeForMerge(new THREE.ConeGeometry(0.13, 0.18, 6)),
      PROP_COLORS.woodLight ?? '#b98a4f',
    ).translate(0, 2.18, 0),
  ]
  const post = mergeGeometries(postParts)!
  postParts.forEach((g) => g.dispose())

  // One plank per landmark: turned to its bearing, lettered with its
  // distance, stacked down the post.
  const rows = found.map((t) => `${t.label}   ${Math.round(metresBetween(from, t.place!))} m`)
  const texture = lettering(rows)
  const plankGeos: THREE.BufferGeometry[] = []
  found.forEach((t, i) => {
    const g = new THREE.BoxGeometry(PLANK_W, PLANK_H, 0.05).toNonIndexed()
    // Map every face to this plank's row; the front face carries the
    // text, the edges just take the plank colour from the same strip.
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let v = 0; v < uv.count; v++) {
      uv.setXY(v, uv.getX(v), (found.length - 1 - i + uv.getY(v)) / found.length)
    }
    // Push the plank out from the post so it reads as nailed on.
    g.translate(PLANK_W / 2 + 0.07, 1.85 - i * 0.3, 0)
    g.rotateY(bearingBetween(from, t.place!))
    plankGeos.push(g)
  })
  const planks = mergeGeometries(plankGeos)!
  plankGeos.forEach((g) => g.dispose())

  return [
    {
      geometry: post,
      material: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    },
    {
      geometry: planks,
      material: new THREE.MeshLambertMaterial({ map: texture, flatShading: true }),
    },
  ]
}
