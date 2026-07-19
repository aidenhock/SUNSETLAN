import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/**
 * Chunky primitive props — the style bible's hand-built replacements for the
 * removed CC0 kit models (docs/style-playbook.md is the technique authority).
 * Every builder returns one merged geometry per material with transforms
 * baked, base at y = 0, sized in real meters, ready for StaticInstances or a
 * plain mesh. Materials are MeshLambertMaterial (the bible's one material
 * language) shared through a palette cache so repeated colors never multiply
 * draw-call state.
 */

export interface PropPart {
  geometry: THREE.BufferGeometry
  material: THREE.MeshLambertMaterial
}

const materialCache = new Map<string, THREE.MeshLambertMaterial>()

/** Shared flat-shaded Lambert per palette color (+ optional emissive). */
export function paletteMaterial(
  color: string,
  emissive = '#000000',
  emissiveIntensity = 0,
): THREE.MeshLambertMaterial {
  const key = `${color}|${emissive}|${emissiveIntensity}`
  let mat = materialCache.get(key)
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color, flatShading: true })
    mat.emissive.set(emissive)
    mat.emissiveIntensity = emissiveIntensity
    materialCache.set(key, mat)
  }
  return mat
}

/** Prop palette — bright soft pastels per the bible. */
export const PROP_COLORS = {
  trunk: '#a97d50',
  frond: '#63b96e',
  coconut: '#7a5a3a',
  stone: '#c3bcae',
  woodLight: '#c99e6a',
  woodDark: '#8a6f47',
  flame: '#ffb060',
  ember: '#ff8c42',
  cream: '#fff3d6',
  lagoon: '#35a7a0',
  slate: '#2b3a42',
} as const

interface Piece {
  geometry: THREE.BufferGeometry
  material: THREE.MeshLambertMaterial
  matrix: THREE.Matrix4
}

/** Compose translation/rotation/scale (applied in that order) for a piece. */
function at(
  geometry: THREE.BufferGeometry,
  material: THREE.MeshLambertMaterial,
  pos: [number, number, number] = [0, 0, 0],
  rot: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
): Piece {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  )
  return { geometry, material, matrix }
}

/** Merge pieces into one geometry per material (playbook §5). */
function mergeByMaterial(pieces: Piece[]): PropPart[] {
  const buckets = new Map<THREE.MeshLambertMaterial, THREE.BufferGeometry[]>()
  for (const p of pieces) {
    const geo = p.geometry.clone().applyMatrix4(p.matrix)
    const list = buckets.get(p.material)
    if (list) list.push(geo)
    else buckets.set(p.material, [geo])
  }
  const parts: PropPart[] = []
  for (const [material, geos] of buckets) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos)
    geos.forEach((g) => g !== merged && g.dispose())
    parts.push({ geometry: merged, material })
  }
  return parts
}

/**
 * Palm (bible spec): stacked banana-curve box trunk + flat wedge fronds.
 * ~3.5 m tall; the trunk leans then straightens segment by segment, fronds
 * are elongated triangular prisms drooping around the crown.
 */
export function buildPalm(): PropPart[] {
  const trunk = paletteMaterial(PROP_COLORS.trunk)
  const frond = paletteMaterial(PROP_COLORS.frond)
  const coconut = paletteMaterial(PROP_COLORS.coconut)
  const pieces: Piece[] = []

  const SEGS = 5
  const SEG_H = 0.62
  const pos = new THREE.Vector3(0, 0, 0)
  for (let i = 0; i < SEGS; i++) {
    const t = i / (SEGS - 1)
    const w = THREE.MathUtils.lerp(0.34, 0.22, t)
    const lean = 0.38 - 0.11 * i // banana curve: leans at the base, upright at the tip
    const dir = new THREE.Vector3(Math.sin(lean), Math.cos(lean), 0)
    const center = pos.clone().addScaledVector(dir, SEG_H / 2)
    pieces.push(
      at(new THREE.BoxGeometry(w, SEG_H + 0.06, w), trunk, [center.x, center.y, center.z], [0, 0, -lean]),
    )
    pos.addScaledVector(dir, SEG_H)
  }

  // Crown: 7 flat wedge fronds (3-sided prisms, tip pointing outward).
  const crown = pos.clone()
  const wedge = new THREE.CylinderGeometry(0.62, 0.62, 0.07, 3, 1, false, Math.PI / 2)
  for (let k = 0; k < 7; k++) {
    const yaw = (k / 7) * Math.PI * 2 + 0.35
    const droop = k % 2 === 0 ? 0.38 : 0.62
    const m = new THREE.Matrix4()
      .makeTranslation(crown.x, crown.y, crown.z)
      .multiply(new THREE.Matrix4().makeRotationY(yaw))
      .multiply(new THREE.Matrix4().makeTranslation(0.6, 0.05, 0))
      .multiply(new THREE.Matrix4().makeRotationZ(-droop))
      .multiply(new THREE.Matrix4().makeScale(1.75, 1, 0.85))
    pieces.push({ geometry: wedge, material: frond, matrix: m })
  }
  // One flat top frond caps the crown.
  pieces.push(
    at(wedge, frond, [crown.x, crown.y + 0.16, crown.z], [0, 1.1, 0], [1.5, 1, 1.3]),
  )
  const nut = new THREE.IcosahedronGeometry(0.13, 0)
  pieces.push(at(nut, coconut, [crown.x + 0.16, crown.y - 0.1, crown.z + 0.08]))
  pieces.push(at(nut, coconut, [crown.x - 0.12, crown.y - 0.12, crown.z - 0.1]))
  return mergeByMaterial(pieces)
}

/** Chunky boulder: two faceted icosahedra, flattened. ~0.85 m tall. */
export function buildRock(): PropPart[] {
  const stone = paletteMaterial(PROP_COLORS.stone)
  return mergeByMaterial([
    at(new THREE.IcosahedronGeometry(0.55, 0), stone, [0, 0.34, 0], [0, 0.4, 0], [1.15, 0.75, 1]),
    at(new THREE.IcosahedronGeometry(0.3, 0), stone, [0.38, 0.2, -0.12], [0, 1.1, 0], [1, 0.8, 1]),
  ])
}

/** Campfire: stone ring, crossed logs, faceted ember-lit flame. ~1.3 m wide. */
export function buildCampfire(): PropPart[] {
  const stone = paletteMaterial(PROP_COLORS.stone)
  const wood = paletteMaterial(PROP_COLORS.woodDark)
  const flame = paletteMaterial(PROP_COLORS.flame, PROP_COLORS.ember, 0.85)
  const pieces: Piece[] = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3
    const s = i % 2 === 0 ? 1 : 0.8
    pieces.push(
      at(
        new THREE.BoxGeometry(0.24, 0.2, 0.2),
        stone,
        [Math.cos(a) * 0.55, 0.09, Math.sin(a) * 0.55],
        [0, -a, 0],
        [s, s, s],
      ),
    )
  }
  const log = new THREE.BoxGeometry(0.75, 0.13, 0.13)
  for (const yaw of [0.26, 1.31, 2.36]) {
    pieces.push(at(log, wood, [0, 0.13, 0], [0, yaw, 0]))
  }
  pieces.push(at(new THREE.ConeGeometry(0.24, 0.5, 5), flame, [0, 0.42, 0]))
  return mergeByMaterial(pieces)
}

/** Log bench: fat faceted log lying along x with lighter end rings. 2 m long. */
export function buildLogBench(): PropPart[] {
  const wood = paletteMaterial(PROP_COLORS.woodDark)
  const rings = paletteMaterial(PROP_COLORS.woodLight)
  const roll = Math.PI / 2
  return mergeByMaterial([
    at(new THREE.CylinderGeometry(0.26, 0.26, 2.0, 7), wood, [0, 0.26, 0], [0, 0, roll]),
    at(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 7), rings, [1.0, 0.26, 0], [0, 0, roll]),
    at(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 7), rings, [-1.0, 0.26, 0], [0, 0, roll]),
  ])
}

/** Crate: pine box with dark corner posts and a strap band. ~0.9 m. */
export function buildCrate(): PropPart[] {
  const pine = paletteMaterial(PROP_COLORS.woodLight)
  const dark = paletteMaterial(PROP_COLORS.woodDark)
  const pieces: Piece[] = [at(new THREE.BoxGeometry(0.8, 0.8, 0.8), pine, [0, 0.4, 0])]
  for (const x of [-0.38, 0.38]) {
    for (const z of [-0.38, 0.38]) {
      pieces.push(at(new THREE.BoxGeometry(0.1, 0.86, 0.1), dark, [x, 0.43, z]))
    }
  }
  pieces.push(at(new THREE.BoxGeometry(0.84, 0.14, 0.84), dark, [0, 0.4, 0]))
  return mergeByMaterial(pieces)
}

/** Rowboat: flat-bottom hull from flared boxes + bench planks. ~2.7 m long (z). */
export function buildRowboat(): PropPart[] {
  const hull = paletteMaterial(PROP_COLORS.trunk)
  const trim = paletteMaterial(PROP_COLORS.cream)
  return mergeByMaterial([
    at(new THREE.BoxGeometry(0.66, 0.12, 2.3), hull, [0, 0.06, 0]),
    at(new THREE.BoxGeometry(0.13, 0.42, 2.45), hull, [0.37, 0.3, 0], [0, 0, -0.16]),
    at(new THREE.BoxGeometry(0.13, 0.42, 2.45), hull, [-0.37, 0.3, 0], [0, 0, 0.16]),
    at(new THREE.BoxGeometry(0.6, 0.42, 0.16), hull, [0, 0.3, 1.22], [0.35, 0, 0]),
    at(new THREE.BoxGeometry(0.6, 0.42, 0.16), hull, [0, 0.3, -1.22], [-0.35, 0, 0]),
    at(new THREE.BoxGeometry(0.62, 0.07, 0.22), trim, [0, 0.42, 0.45]),
    at(new THREE.BoxGeometry(0.62, 0.07, 0.22), trim, [0, 0.42, -0.45]),
  ])
}

/** Camera tripod (Photos): splayed legs + boxy camera, lens toward +z. ~1.4 m. */
export function buildTripod(): PropPart[] {
  const wood = paletteMaterial(PROP_COLORS.woodDark)
  const body = paletteMaterial(PROP_COLORS.slate)
  const ring = paletteMaterial(PROP_COLORS.cream)
  const accent = paletteMaterial(PROP_COLORS.ember)
  const pieces: Piece[] = []
  const leg = new THREE.CylinderGeometry(0.03, 0.045, 1.15, 5)
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Matrix4()
      .makeTranslation(0, 1.08, 0)
      .multiply(new THREE.Matrix4().makeRotationY((i / 3) * Math.PI * 2))
      .multiply(new THREE.Matrix4().makeRotationZ(0.3))
      .multiply(new THREE.Matrix4().makeTranslation(0, -0.575, 0))
    pieces.push({ geometry: leg, material: wood, matrix: m })
  }
  pieces.push(at(new THREE.BoxGeometry(0.16, 0.06, 0.16), body, [0, 1.1, 0]))
  pieces.push(at(new THREE.BoxGeometry(0.36, 0.24, 0.22), body, [0, 1.25, 0]))
  const lens = new THREE.CylinderGeometry(0.09, 0.1, 0.18, 8)
  pieces.push(at(lens, body, [0, 1.25, 0.2], [Math.PI / 2, 0, 0]))
  pieces.push(at(new THREE.CylinderGeometry(0.105, 0.105, 0.03, 8), ring, [0, 1.25, 0.29], [Math.PI / 2, 0, 0]))
  pieces.push(at(new THREE.BoxGeometry(0.06, 0.03, 0.06), accent, [0.11, 1.385, 0]))
  return mergeByMaterial(pieces)
}

/** Mailbox (Contact): wood post, lagoon rounded body, cream door, ember flag. ~1.2 m. */
export function buildMailbox(): PropPart[] {
  const wood = paletteMaterial(PROP_COLORS.woodDark)
  const shell = paletteMaterial(PROP_COLORS.lagoon)
  const door = paletteMaterial(PROP_COLORS.cream)
  const flag = paletteMaterial(PROP_COLORS.ember)
  return mergeByMaterial([
    at(new THREE.BoxGeometry(0.1, 0.72, 0.1), wood, [0, 0.36, 0]),
    at(new RoundedBoxGeometry(0.34, 0.32, 0.5, 2, 0.07), shell, [0, 0.86, 0]),
    at(new RoundedBoxGeometry(0.28, 0.26, 0.05, 2, 0.05), door, [0, 0.86, 0.24]),
    at(new THREE.BoxGeometry(0.03, 0.2, 0.03), flag, [0.19, 1.06, 0.05]),
    at(new THREE.BoxGeometry(0.03, 0.09, 0.16), flag, [0.19, 1.16, 0.12]),
  ])
}

/** Palapa (Projects): four posts, faceted thatch cone roof, wood desk. */
export function buildPalapa(): PropPart[] {
  const wood = paletteMaterial(PROP_COLORS.woodDark)
  const thatch = paletteMaterial('#d8c37e')
  const pieces: Piece[] = []
  const post = new THREE.CylinderGeometry(0.1, 0.12, 2.6, 5)
  for (const x of [-1.4, 1.4]) {
    for (const z of [-1.2, 1.2]) {
      pieces.push(at(post, wood, [x, 1.2, z]))
    }
  }
  pieces.push(at(new THREE.ConeGeometry(2.6, 1.1, 4), thatch, [0, 2.7, 0]))
  pieces.push(at(new THREE.BoxGeometry(1.4, 0.9, 0.7), wood, [-1.6, 0.55, 0]))
  return mergeByMaterial(pieces)
}

/** Big tree (About): chunky trunk, icosahedron canopy, branch with rings. */
export function buildBigTree(): PropPart[] {
  const wood = paletteMaterial(PROP_COLORS.woodDark)
  const leaf = paletteMaterial(PROP_COLORS.frond)
  const stone = paletteMaterial(PROP_COLORS.stone)
  const pieces: Piece[] = [
    at(new THREE.CylinderGeometry(0.35, 0.5, 3.4, 7), wood, [0, 1.7, 0]),
    at(new THREE.IcosahedronGeometry(2.2, 0), leaf, [0, 4.1, 0]),
    at(new THREE.CylinderGeometry(0.12, 0.12, 2.1, 5), wood, [-1.5, 2.9, 0], [0, 0, 0.8]),
  ]
  const ringGeo = new THREE.TorusGeometry(0.16, 0.035, 6, 12)
  pieces.push(at(ringGeo, stone, [-2.2, 2.35, 0]))
  pieces.push(at(ringGeo, stone, [-1.8, 2.35, 0]))
  return mergeByMaterial(pieces)
}
