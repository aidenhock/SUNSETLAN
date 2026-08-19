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

/** A plank: long enough to read from a distance, with a pointed tip. */
const PLANK_L = 1.85
const PLANK_H = 0.44
const PLANK_TIP = 0.34
const PLANK_THICK = 0.07
/** Totem: a chunky post with the planks stacked down it. */
const POST_H = 3.5
const POST_R = 0.15
const TOP_PLANK_Y = 3.02
const PLANK_GAP = 0.5
/** One atlas row per plank, at the plank's own aspect so type never
 *  stretches. */
const ROW_W = 1024
const ROW_H = Math.round(ROW_W / (PLANK_L / PLANK_H))

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
  canvas.width = ROW_W
  canvas.height = ROW_H * Math.max(1, rows.length)
  const ctx = canvas.getContext('2d')!
  rows.forEach((text, i) => {
    const y = i * ROW_H
    // The plank itself, with a grain line and a darker underside so the
    // board reads as carved wood rather than a flat label.
    ctx.fillStyle = '#c9a266'
    ctx.fillRect(0, y, ROW_W, ROW_H)
    ctx.fillStyle = 'rgba(120, 84, 40, 0.16)'
    ctx.fillRect(0, y + ROW_H * 0.18, ROW_W, 3)
    ctx.fillRect(0, y + ROW_H * 0.82, ROW_W, 3)
    ctx.fillStyle = 'rgba(0,0,0,0.14)'
    ctx.fillRect(0, y + ROW_H - 10, ROW_W, 10)

    // Type as large as the board allows, shrunk only if a long name
    // would otherwise run into the arrow tip.
    const inset = ROW_W * 0.05
    const usable = ROW_W - inset - ROW_W * (PLANK_TIP / PLANK_L) - inset * 0.5
    let size = Math.floor(ROW_H * 0.46)
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    do {
      ctx.font = `800 ${size}px ui-sans-serif, system-ui, sans-serif`
      if (ctx.measureText(text).width <= usable) break
      size -= 4
    } while (size > 16)
    ctx.fillStyle = '#3b2b18'
    ctx.fillText(text, inset, y + ROW_H / 2)
  })
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/**
 * One plank: a flat arrow, pointed at the far end, lettered from its own
 * row of the atlas. Built along +X and then swung to its bearing.
 */
export function plank(rowIndex: number, rowCount: number, bearing: number, y: number): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  const h = PLANK_H / 2
  shape.moveTo(0, -h)
  shape.lineTo(PLANK_L - PLANK_TIP, -h)
  shape.lineTo(PLANK_L, 0) // the point
  shape.lineTo(PLANK_L - PLANK_TIP, h)
  shape.lineTo(0, h)
  shape.closePath()
  const g = new THREE.ExtrudeGeometry(shape, { depth: PLANK_THICK, bevelEnabled: false })
  g.translate(0, 0, -PLANK_THICK / 2)

  // UVs straight from the shape's own coordinates, so the lettering sits
  // on the board no matter which faces Extrude generated.
  const pos = g.attributes.position as THREE.BufferAttribute
  const nor = g.attributes.normal as THREE.BufferAttribute
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    let u = THREE.MathUtils.clamp(pos.getX(i) / PLANK_L, 0, 1)
    const v = THREE.MathUtils.clamp((pos.getY(i) + h) / PLANK_H, 0, 1)
    // The BACK face is seen in a mirror, so its lettering has to be
    // mirrored too or half the sign reads backwards — which is exactly
    // how it looked before. A real signpost is painted on both sides.
    if (nor.getZ(i) < -0.5) u = 1 - u
    uv.setXY(i, u, (rowCount - 1 - rowIndex + v) / rowCount)
  }

  // Out past the post, up to its slot, then turned to point at the
  // landmark.
  //
  // The frame is the fiddly part. `surfacePartMatrix` aligns local +Z
  // with NORTH, and in a right-handed frame with +Y up that puts EAST at
  // local −X, not +X. The plank is built along +X, so pointing it along
  // a bearing b — east·sin b + north·cos b, i.e. (−sin b, 0, cos b) —
  // needs rotateY(−b − π/2). Turning it the other way is correct due
  // north and mirrored everywhere else, which is exactly what the first
  // two attempts did.
  g.translate(POST_R * 0.75, y, 0)
  g.rotateY(-bearing - Math.PI / 2)
  return g
}


/** Place a tinted primitive: the local helper the totem parts share. */
function piece(
  g: THREE.BufferGeometry,
  color: string,
  pos: [number, number, number],
  rot: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
): THREE.BufferGeometry {
  const n = tintGeometry(normalizeForMerge(g), color)
  g.dispose()
  n.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
      new THREE.Vector3(...scale),
    ),
  )
  return n
}

/**
 * The hawk on top, wings spread — the carved figure a totem wants at its
 * head. Chunky faceted primitives like everything else, and merged into
 * the post so the whole totem stays one draw call.
 *
 * It faces local +Z, which is NORTH: the signpost sits below the pole,
 * so that is the way an arriving visitor comes from.
 */
function hawkParts(y: number): THREE.BufferGeometry[] {
  const BODY = '#6b4a2f'
  const CHEST = '#c9a266'
  const WING = '#5a3d26'
  const TIP = '#3a2717'
  const BEAK = '#e3b23c'
  const EYE = '#1a1208'

  const wing = (side: 1 | -1) => [
    // Inner wing, swept up and out from the shoulder.
    piece(new THREE.BoxGeometry(0.62, 0.075, 0.3), WING, [side * 0.4, y + 0.5, 0.02], [0, side * -0.18, side * 0.34]),
    // Outer wing, angled up more — the kink is what reads as a raptor.
    piece(new THREE.BoxGeometry(0.5, 0.06, 0.22), WING, [side * 0.95, y + 0.71, -0.04], [0, side * -0.3, side * 0.62]),
    // Dark primaries at the very tip.
    piece(new THREE.BoxGeometry(0.26, 0.05, 0.19), TIP, [side * 1.24, y + 0.85, -0.08], [0, side * -0.36, side * 0.66]),
  ]

  return [
    // Perch cap the bird stands on.
    piece(new THREE.CylinderGeometry(0.23, 0.19, 0.1, 8), '#8a6a45', [0, y - 0.04, 0]),
    // Talons.
    piece(new THREE.BoxGeometry(0.09, 0.07, 0.16), BEAK, [-0.08, y + 0.04, 0.03]),
    piece(new THREE.BoxGeometry(0.09, 0.07, 0.16), BEAK, [0.08, y + 0.04, 0.03]),
    // Body, leaning forward a touch, with a pale chest.
    piece(new THREE.BoxGeometry(0.3, 0.36, 0.26), BODY, [0, y + 0.26, 0], [0.12, 0, 0]),
    piece(new THREE.BoxGeometry(0.2, 0.26, 0.06), CHEST, [0, y + 0.24, 0.13], [0.12, 0, 0]),
    // Tail, fanned out behind and angled down.
    piece(new THREE.BoxGeometry(0.26, 0.05, 0.38), WING, [0, y + 0.16, -0.24], [-0.5, 0, 0]),
    piece(new THREE.BoxGeometry(0.3, 0.045, 0.14), TIP, [0, y + 0.06, -0.42], [-0.5, 0, 0]),
    // Head, hooded brow, beak and eyes.
    piece(new THREE.BoxGeometry(0.22, 0.2, 0.22), BODY, [0, y + 0.53, 0.03]),
    piece(new THREE.BoxGeometry(0.24, 0.06, 0.2), TIP, [0, y + 0.62, 0.02]),
    piece(new THREE.ConeGeometry(0.055, 0.17, 4), BEAK, [0, y + 0.5, 0.17], [Math.PI / 2, Math.PI / 4, 0]),
    piece(new THREE.SphereGeometry(0.032, 6, 5), EYE, [-0.08, y + 0.56, 0.12]),
    piece(new THREE.SphereGeometry(0.032, 6, 5), EYE, [0.08, y + 0.56, 0.12]),
    ...wing(1),
    ...wing(-1),
  ]
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

  // The totem: a heavy squared post with carved bands, and a tapered
  // cap. Chunky enough to carry six boards without looking like a stick.
  const postParts = [
    tintGeometry(
      normalizeForMerge(new THREE.CylinderGeometry(POST_R, POST_R * 1.15, POST_H, 8)),
      PROP_COLORS.woodDark,
    ).translate(0, POST_H / 2, 0),
    tintGeometry(
      normalizeForMerge(new THREE.CylinderGeometry(POST_R * 1.5, POST_R * 1.5, 0.12, 8)),
      '#8a6a45',
    ).translate(0, 0.09, 0),
    tintGeometry(
      normalizeForMerge(new THREE.CylinderGeometry(POST_R * 1.35, POST_R * 1.35, 0.1, 8)),
      '#8a6a45',
    ).translate(0, POST_H - 0.22, 0),
    ...hawkParts(POST_H + 0.02),
  ]
  const post = mergeGeometries(postParts)!
  postParts.forEach((g) => g.dispose())

  // One lettered arrow per landmark, stacked down the post, each turned
  // to its own bearing.
  const rows = found.map((t) => `${t.label}   ${Math.round(metresBetween(from, t.place!))} m`)
  const texture = lettering(rows)
  const plankGeos = found.map((t, i) =>
    plank(i, found.length, bearingBetween(from, t.place!), TOP_PLANK_Y - i * PLANK_GAP),
  )
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
