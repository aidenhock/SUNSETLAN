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

/**
 * Normalize for merging: mergeGeometries requires identical attribute sets
 * and index-ness, but RoundedBox/Icosahedron are non-indexed while the other
 * primitives are indexed. Everything becomes non-indexed (flat facets are the
 * look anyway) and drops uv (no image textures per the bible).
 */
export function normalizeForMerge(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = geometry.index ? geometry.toNonIndexed() : geometry.clone()
  out.deleteAttribute('uv')
  return out
}

/** Merge pieces into one geometry per material (playbook §5). */
function mergeByMaterial(pieces: Piece[]): PropPart[] {
  const buckets = new Map<THREE.MeshLambertMaterial, THREE.BufferGeometry[]>()
  for (const p of pieces) {
    const geo = normalizeForMerge(p.geometry).applyMatrix4(p.matrix)
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

/** Campfire base (Fire 2.0 rebuild): a TEEPEE of five chunky faceted
 * logs leaning inward — visible outer ends, per-log lean/roll
 * variance — ringed by irregular ROUNDED stones (varied dodecahedra,
 * never uniform cubes), each sunk so it bites the sand. The FLAME is
 * the animated <Fire> component, not part of this static prop. */
export function buildCampfire(): PropPart[] {
  const stone = paletteMaterial(PROP_COLORS.stone)
  const wood = paletteMaterial(PROP_COLORS.woodDark)
  const rings = paletteMaterial(PROP_COLORS.woodLight)
  const pieces: Piece[] = []
  // Teepee logs: bases on a ~0.30 m circle, tips crossing near the
  // center at ~0.5 m. Lean/length/roll jitter is deterministic.
  const LOGS = [
    { az: 0.4, lean: 0.62, len: 0.68, r: 0.062 },
    { az: 1.75, lean: 0.55, len: 0.62, r: 0.07 },
    { az: 3.0, lean: 0.66, len: 0.7, r: 0.058 },
    { az: 4.25, lean: 0.58, len: 0.6, r: 0.072 },
    { az: 5.45, lean: 0.63, len: 0.66, r: 0.065 },
  ]
  for (const l of LOGS) {
    // Local: log along +y, leaned outward at the base by rotating
    // about the tangent axis, then swung to its azimuth.
    const dir = new THREE.Vector3(Math.cos(l.az), 0, Math.sin(l.az))
    const mid = dir.clone().multiplyScalar(0.17).setY(l.len * 0.42)
    const tilt = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(-dir.z, 0, dir.x),
      -l.lean,
    )
    const e = new THREE.Euler().setFromQuaternion(tilt)
    pieces.push(
      at(new THREE.CylinderGeometry(l.r, l.r * 1.12, l.len, 6), wood, [mid.x, mid.y, mid.z], [e.x, e.y, e.z]),
    )
    // Lighter end disc on the outer (base) end — the visible cut face.
    const end = dir.clone().multiplyScalar(0.17 + Math.sin(l.lean) * l.len * 0.5)
    end.y = l.len * 0.42 - Math.cos(l.lean) * l.len * 0.5 + 0.012
    pieces.push(
      at(new THREE.CylinderGeometry(l.r * 1.08, l.r * 1.08, 0.03, 6), rings, [end.x, Math.max(end.y, 0.05), end.z], [e.x, e.y, e.z]),
    )
  }
  // Stone ring: 9 rounded irregular stones, sunk ~30% for bite.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.22 + (i % 3) * 0.09
    const r = 0.075 + ((i * 37) % 5) * 0.009
    const squash = 0.75 + ((i * 23) % 4) * 0.1
    pieces.push(
      at(
        new THREE.DodecahedronGeometry(r, 0),
        stone,
        [Math.cos(a) * 0.56, r * squash * 0.62, Math.sin(a) * 0.56],
        [i * 0.7, a, i * 1.3],
        [1 + ((i * 13) % 3) * 0.14, squash, 1 - ((i * 7) % 3) * 0.08],
      ),
    )
  }
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

/** Mailbox (Contact): chunky AC proportions — thick post, big lagoon rounded
 * body with an inset cream door, side-mounted ember flag. ~1.3 m. */
export function buildMailbox(): PropPart[] {
  const wood = paletteMaterial(PROP_COLORS.woodDark)
  const shell = paletteMaterial(PROP_COLORS.lagoon)
  const door = paletteMaterial(PROP_COLORS.cream)
  const flag = paletteMaterial(PROP_COLORS.ember)
  return mergeByMaterial([
    at(new THREE.BoxGeometry(0.14, 0.78, 0.14), wood, [0, 0.39, 0]),
    at(new RoundedBoxGeometry(0.46, 0.42, 0.62, 2, 0.12), shell, [0, 0.97, 0]),
    at(new RoundedBoxGeometry(0.3, 0.3, 0.06, 2, 0.06), door, [0, 0.97, 0.29]),
    at(new THREE.BoxGeometry(0.04, 0.26, 0.04), flag, [0.27, 1.1, 0]),
    at(new THREE.BoxGeometry(0.04, 0.1, 0.22), flag, [0.27, 1.26, -0.08]),
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
  // Gym rings HANG from the branch on straps (placement rule: nothing floats).
  // Branch line: y = 2.9 + 0.697 · (x + 1.5) / −0.717 for x along the branch.
  const strap = paletteMaterial(PROP_COLORS.cream)
  const ringGeo = new THREE.TorusGeometry(0.16, 0.035, 6, 12)
  for (const [x, branchY] of [
    [-1.7, 3.09],
    [-2.0, 3.39],
  ] as const) {
    const ringTop = 2.5 + 0.2
    pieces.push(at(new THREE.BoxGeometry(0.04, branchY - ringTop + 0.08, 0.04), strap, [x, (branchY + ringTop) / 2, 0]))
    pieces.push(at(ringGeo, stone, [x, 2.5, 0]))
  }
  return mergeByMaterial(pieces)
}
