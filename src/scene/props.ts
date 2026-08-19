import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { tintGeometry, wrapToSphere } from './geometryUtils'
import { placement } from '../content/placements'
import { groundAltitudeAt } from '../controls/terrain'
import { PLANET_RADIUS, SINK_M } from './planetConfig'

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

// The campfire base (teepee logs + stone ring) lives in <Fire> now —
// its wood catches the firelight with baked warm vertex tints and a
// flickering emissive, which a shared static palette prop can't do.

/** Music portal: a chunky boombox STEREO sitting on a short driftwood
 * log (Aiden's call — the resting ukulele read as a lump from above).
 * ONE vertex-tinted merged mesh (draw-call budget: separate palette
 * materials would cost a draw each right at the 50-call mobile line). */
export function buildMusicStereo(): PropPart[] {
  const tinted = (g: THREE.BufferGeometry, color: string, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) => {
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
  const tilt: [number, number, number] = [0, 0.25, 0.06]
  const parts = [
    // Driftwood log lying along x, slightly rolled, lighter end cut.
    tinted(new THREE.CylinderGeometry(0.16, 0.16, 1.1, 7), PROP_COLORS.woodDark, [0, 0.16, 0], [0.1, 0, Math.PI / 2]),
    tinted(new THREE.CylinderGeometry(0.165, 0.165, 0.03, 7), PROP_COLORS.woodLight, [0.56, 0.16, 0], [0.1, 0, Math.PI / 2]),
    // The boombox perched on the log, slight jaunty yaw: lagoon body,
    // cream speaker rims, dark grills, a tape deck and a handle.
    tinted(new THREE.BoxGeometry(0.5, 0.28, 0.18), PROP_COLORS.lagoon, [0.02, 0.46, 0], tilt),
    tinted(new THREE.CylinderGeometry(0.095, 0.095, 0.03, 10), PROP_COLORS.cream, [-0.13, 0.45, 0.085], [Math.PI / 2 + 0.06, 0.25, 0]),
    tinted(new THREE.CylinderGeometry(0.095, 0.095, 0.03, 10), PROP_COLORS.cream, [0.17, 0.45, 0.048], [Math.PI / 2 + 0.06, 0.25, 0]),
    tinted(new THREE.CylinderGeometry(0.062, 0.062, 0.035, 10), PROP_COLORS.slate, [-0.13, 0.45, 0.09], [Math.PI / 2 + 0.06, 0.25, 0]),
    tinted(new THREE.CylinderGeometry(0.062, 0.062, 0.035, 10), PROP_COLORS.slate, [0.17, 0.45, 0.053], [Math.PI / 2 + 0.06, 0.25, 0]),
    tinted(new THREE.BoxGeometry(0.11, 0.07, 0.03), PROP_COLORS.slate, [0.02, 0.5, 0.078], tilt),
    // Carry handle arched over the top.
    tinted(new THREE.BoxGeometry(0.26, 0.035, 0.05), PROP_COLORS.slate, [0.02, 0.64, 0], tilt),
    tinted(new THREE.BoxGeometry(0.035, 0.06, 0.05), PROP_COLORS.slate, [-0.1, 0.61, -0.03], tilt),
    tinted(new THREE.BoxGeometry(0.035, 0.06, 0.05), PROP_COLORS.slate, [0.14, 0.61, 0.03], tilt),
    // Stubby antenna, angled back.
    tinted(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5), PROP_COLORS.cream, [0.22, 0.72, -0.06], [-0.4, 0, -0.5]),
  ]
  const merged = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  return [{ geometry: merged, material: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }) }]
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
  // ONE vertex-tinted merge (draw-call shave: two palette materials
  // cost two draws for a background crate).
  const tinted = (g: THREE.BufferGeometry, color: string, pos: [number, number, number]) => {
    const n = tintGeometry(normalizeForMerge(g), color)
    g.dispose()
    n.applyMatrix4(new THREE.Matrix4().setPosition(...pos))
    return n
  }
  const parts: THREE.BufferGeometry[] = [
    tinted(new THREE.BoxGeometry(0.8, 0.8, 0.8), PROP_COLORS.woodLight, [0, 0.4, 0]),
    tinted(new THREE.BoxGeometry(0.84, 0.14, 0.84), PROP_COLORS.woodDark, [0, 0.4, 0]),
  ]
  for (const x of [-0.38, 0.38]) {
    for (const z of [-0.38, 0.38]) {
      parts.push(tinted(new THREE.BoxGeometry(0.1, 0.86, 0.1), PROP_COLORS.woodDark, [x, 0.43, z]))
    }
  }
  const merged = mergeGeometries(parts)
  parts.forEach((g) => g.dispose())
  return [{ geometry: merged, material: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }) }]
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

/**
 * Memorial garden (rebuild — ACNH-style fenced plot, MUCH bigger and
 * walkable; replaces the old 3.2 m circular stone-wall ring that read
 * as "hard to walk around in"). A `placement('cemetery').size` rectangle
 * (17 × 13 m) of chunky light-stone fence posts (~2.2 m spacing) with
 * dark iron rail sections between them on all four sides, a ~3 m south
 * gate flanked by taller posts (no panel spans the gap), two rows of
 * decorative headstones + flower clusters along the north fence, a
 * raised stone path from the gate toward the plot's middle, a log
 * bench near the east fence, and two lantern posts flanking the path.
 * The interior stays EMPTY lawn — the whole point is walking around
 * inside (the moai lesson: no invisible walls; planetConfig's cemetery
 * blockers trace only the fence line the player can SEE).
 *
 * The three INTERACTABLE headstones (memorials.ts, ids memorial-1..3)
 * are separate `buildHeadstone` bodies at lat 45.6 / longs 104.4-109.6,
 * which land at local (east, north) ≈ (-1.7, -1.34), (0, -1.34),
 * (1.7, -1.34) m relative to the plot center — south of center, so the
 * decorative rows (north half, z = +1.4/+3.2) stay well clear.
 *
 * Built flat in the local +X east / +Y up / +Z north frame (placement
 * rule 3's convention), then wrapToSphere-bent onto the planet
 * (placement rule 2 — a 17 m span sags mid-length and buries its
 * corners as one flat mesh). The RETURNED geometry is therefore
 * already in planet-local ABSOLUTE coordinates, unlike every other
 * builder in this file: render it with NO placement transform. ONE
 * vertex-tinted merge (one draw call).
 */
/**
 * The telescope on the night beach: a chunky tripod and a tube tilted
 * up at the moon's meridian. Brass and dark metal, faceted like
 * everything else. "E — Look through it" reads tonight's real phase.
 */
export function buildTelescope(): PropPart[] {
  const tinted = (
    g: THREE.BufferGeometry,
    color: string,
    pos: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
  ) => {
    const n = tintGeometry(normalizeForMerge(g), color)
    g.dispose()
    n.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(...pos),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
        new THREE.Vector3(1, 1, 1),
      ),
    )
    return n
  }
  const METAL = '#3a4048'
  const BRASS = '#b8894a'
  const parts: THREE.BufferGeometry[] = []
  // Three splayed legs.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4
    parts.push(
      tinted(new THREE.CylinderGeometry(0.035, 0.045, 1.15, 5), METAL, [
        Math.sin(a) * 0.16,
        0.55,
        Math.cos(a) * 0.16,
      ], [Math.cos(a) * 0.26, 0, -Math.sin(a) * 0.26]),
    )
  }
  // Head, tube and eyepiece: the tube tilts up toward the sky.
  parts.push(tinted(new THREE.BoxGeometry(0.17, 0.12, 0.17), METAL, [0, 1.12, 0]))
  const TILT = -0.62
  parts.push(tinted(new THREE.CylinderGeometry(0.085, 0.1, 0.78, 8), BRASS, [0, 1.32, 0.06], [TILT, 0, 0]))
  parts.push(tinted(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 6), METAL, [0, 1.06, -0.28], [TILT, 0, 0]))
  parts.push(tinted(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 8), METAL, [0, 1.56, 0.28], [TILT, 0, 0]))
  const merged = mergeGeometries(parts)
  parts.forEach((g) => g.dispose())
  return [
    {
      geometry: merged,
      material: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    },
  ]
}

export function buildCemetery(plot: {
  lat: number
  long: number
  yawDeg: number
  size?: { widthM: number; depthM: number }
} = placement('cemetery')): PropPart[] {
  const tinted = (g: THREE.BufferGeometry, color: string, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) => {
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

  const cem = plot
  const HW = (cem.size?.widthM ?? 17) / 2
  const HD = (cem.size?.depthM ?? 13) / 2
  const GATE_HALF = 1.5 // ~3 m opening, centered on the south (downhill) edge

  const POST = '#cfc9bb'
  const POST_CAP = '#a39d8f' // darker cap
  const IRON = '#3a3f47'
  const HEADSTONES = ['#b5b0a4', '#9d988c', '#8d8579']
  const FLOWERS = ['#f5efdd', '#e893b8', '#ffd166'] // white, pink, yellow
  const PATH = PROP_COLORS.stone
  const WOOD = PROP_COLORS.woodDark
  const WOOD_LIGHT = PROP_COLORS.woodLight
  const LANTERN_POST = PROP_COLORS.slate
  const LANTERN = '#ffe6b0'

  const parts: THREE.BufferGeometry[] = []

  /** Evenly spaced points along a straight run, ~pitch meters apart
   * (never exactly pitch — the run divides evenly so posts land on
   * both ends). */
  const spaced = (from: number, to: number, pitch = 2.2): number[] => {
    const len = to - from
    const count = Math.max(1, Math.round(len / pitch)) + 1
    return Array.from({ length: count }, (_, i) => from + (len * i) / (count - 1))
  }

  const post = (x: number, z: number, tall = false) => {
    const h = tall ? 1.5 : 1.0
    parts.push(tinted(new THREE.BoxGeometry(0.34, h, 0.34), POST, [x, h / 2, z]))
    const capH = tall ? 0.14 : 0.1
    parts.push(tinted(new THREE.BoxGeometry(0.4, capH, 0.4), POST_CAP, [x, h + capH / 2, z]))
  }

  // Dark iron rail section between two posts: 4 vertical bars + a top
  // rail, oriented along the panel via atan2(dx,dz) — three.js rotateY
  // maps local +Z to world (sinθ, 0, cosθ), so this is the angle whose
  // sin/cos matches the panel's direction.
  const panel = (x1: number, z1: number, x2: number, z2: number) => {
    const dx = x2 - x1
    const dz = z2 - z1
    const len = Math.hypot(dx, dz)
    for (let i = 1; i <= 4; i++) {
      const t = i / 5
      parts.push(tinted(new THREE.BoxGeometry(0.05, 0.85, 0.05), IRON, [x1 + dx * t, 0.425, z1 + dz * t]))
    }
    const yaw = Math.atan2(dx, dz)
    parts.push(
      tinted(new THREE.BoxGeometry(0.05, 0.05, len), IRON, [x1 + dx / 2, 0.85, z1 + dz / 2], [0, yaw, 0]),
    )
  }

  // North side: posts + panels across the full width.
  const northXs = spaced(-HW, HW)
  northXs.forEach((x) => post(x, HD))
  for (let i = 0; i < northXs.length - 1; i++) panel(northXs[i], HD, northXs[i + 1], HD)

  // South side: two segments flanking the gate. Each segment's inner
  // post (nearest the gap) is the taller gate post; no panel crosses
  // the gap itself — that's the open walk-through.
  const southLeft = spaced(-HW, -GATE_HALF)
  const southRight = spaced(GATE_HALF, HW)
  southLeft.forEach((x, i) => post(x, -HD, i === southLeft.length - 1))
  southRight.forEach((x, i) => post(x, -HD, i === 0))
  for (let i = 0; i < southLeft.length - 1; i++) panel(southLeft[i], -HD, southLeft[i + 1], -HD)
  for (let i = 0; i < southRight.length - 1; i++) panel(southRight[i], -HD, southRight[i + 1], -HD)

  // East/west sides: interior posts only — the four corners already
  // stand from the north/south passes above — but panels still run the
  // FULL side, corner to corner.
  const eastZs = spaced(-HD, HD)
  eastZs.slice(1, -1).forEach((z) => post(HW, z))
  for (let i = 0; i < eastZs.length - 1; i++) panel(HW, eastZs[i], HW, eastZs[i + 1])
  const westZs = spaced(-HD, HD)
  westZs.slice(1, -1).forEach((z) => post(-HW, z))
  for (let i = 0; i < westZs.length - 1; i++) panel(-HW, westZs[i], -HW, westZs[i + 1])

  // Two rows of decorative headstones parallel to the north fence, 4
  // per row, evenly spread — north half only, clear of the interactable
  // row's south-center landing spot (see the doc comment above).
  const ROW_XS = [-5.25, -1.75, 1.75, 5.25]
  let hi = 0
  for (const rowZ of [3.2, 1.4]) {
    for (const x of ROW_XS) {
      const color = HEADSTONES[hi % HEADSTONES.length]
      const yawJitter = (((hi * 37) % 7) - 3) * 0.03
      const lean = 0.05 + ((hi * 13) % 3) * 0.02
      // Alternate rounded-top slabs and squarer ones.
      const geo =
        hi % 2 === 0
          ? new RoundedBoxGeometry(0.4, 0.6, 0.14, 2, 0.14)
          : new THREE.BoxGeometry(0.42, 0.58, 0.14)
      parts.push(tinted(geo, color, [x, 0.3, rowZ], [lean, yawJitter, 0]))
      // Flower cluster on the south (approach) face of the stone.
      const fz = rowZ - 0.2
      const n = 3 + (hi % 2)
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + hi
        const r = 0.06 + (k % 2) * 0.03
        const fx = x + Math.cos(a) * r
        const fzz = fz + Math.sin(a) * r
        parts.push(tinted(new THREE.CylinderGeometry(0.012, 0.016, 0.13, 4), '#4f8a58', [fx, 0.065, fzz]))
        parts.push(
          tinted(new THREE.SphereGeometry(0.045, 6, 4), FLOWERS[(hi + k) % FLOWERS.length], [fx, 0.14, fzz], [0, 0, 0], [1, 0.7, 1]),
        )
      }
      hi++
    }
  }

  // Stone path from the gate toward the plot's middle: raised slabs
  // (~0.02 m) with small gaps between them, not a solid ribbon.
  for (let z = -HD + 0.2; z <= -0.2; z += 1.0) {
    const wobble = (((z * 971) % 1) + 1) % 1
    parts.push(tinted(new THREE.BoxGeometry(1.2, 0.04, 0.8), PATH, [(wobble - 0.5) * 0.1, 0.01, z]))
  }

  // Log bench near the east fence — log axis along north-south (rotateX
  // turns the cylinder's default +Y axis to +Z) so a seated visitor's
  // back is to the fence, facing west into the lawn. Inlined rather
  // than calling buildLogBench: that builder returns its own palette
  // material, which can't join this single vertex-tinted merge.
  const benchX = HW - 1.3
  parts.push(tinted(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 7), WOOD, [benchX, 0.22, 0], [Math.PI / 2, 0, 0]))
  for (const bz of [0.8, -0.8]) {
    parts.push(
      tinted(new THREE.CylinderGeometry(0.23, 0.23, 0.03, 7), WOOD_LIGHT, [benchX, 0.22, bz], [Math.PI / 2, 0, 0]),
    )
  }

  // Two lantern posts flanking the path just inside the gate.
  for (const lx of [-0.9, 0.9]) {
    parts.push(tinted(new THREE.CylinderGeometry(0.05, 0.06, 1.3, 6), LANTERN_POST, [lx, 0.65, -HD + 0.5]))
    parts.push(tinted(new THREE.BoxGeometry(0.18, 0.22, 0.18), LANTERN, [lx, 1.41, -HD + 0.5]))
  }

  const flat = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())

  const wrapped = wrapToSphere(flat, {
    lat: cem.lat,
    long: cem.long,
    radius: PLANET_RADIUS,
    yawRad: (cem.yawDeg * Math.PI) / 180,
    baseAlt: groundAltitudeAt(cem.lat, cem.long) - SINK_M,
  })
  flat.dispose()
  return [{ geometry: wrapped, material: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }) }]
}

/** One interactable headstone: a chunky rounded stone with a slight
 * lean and a lighter face panel — the Remember portals. */
export function buildHeadstone(): PropPart[] {
  const tinted = (g: THREE.BufferGeometry, color: string, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]) => {
    const n = tintGeometry(normalizeForMerge(g), color)
    g.dispose()
    n.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(...pos),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
        new THREE.Vector3(1, 1, 1),
      ),
    )
    return n
  }
  const parts = [
    tinted(new RoundedBoxGeometry(0.5, 0.74, 0.16, 2, 0.08), '#b5b0a4', [0, 0.34, 0], [0.04, 0, 0.02]),
    tinted(new RoundedBoxGeometry(0.36, 0.4, 0.03, 2, 0.05), '#c6c1b5', [0, 0.42, 0.08], [0.04, 0, 0.02]),
    tinted(new THREE.SphereGeometry(0.05, 6, 4), '#e893b8', [0.2, 0.06, 0.12]),
  ]
  const merged = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  return [{ geometry: merged, material: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }) }]
}

/** Bulletin board (Papers portal): a chunky faceted corkboard on two
 * wooden posts with a little sloped roof (the AC reference), weathered
 * green frame, cork face carrying pinned off-white paper quads at
 * slight random rotations with tiny colored pin dots and two curled
 * corners. Faces local +z (north = the walking approach) — the def
 * adds a slight yaw. ONE vertex-tinted merged mesh. */
export function buildBulletinBoard(): PropPart[] {
  const tinted = (g: THREE.BufferGeometry, color: string, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) => {
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
  const FRAME = '#7f9578'
  const CORK = '#cfa76b'
  const PAPER = '#f5efdd'
  const PAPER_SHADE = '#e4dcc4'
  const PINS = ['#d94f3d', '#3d6fd9', '#e3b23c', '#3da05a']
  const parts: THREE.BufferGeometry[] = [
    // Posts + framed board.
    tinted(new THREE.BoxGeometry(0.13, 1.05, 0.13), PROP_COLORS.woodDark, [-0.72, 0.5, 0]),
    tinted(new THREE.BoxGeometry(0.13, 1.05, 0.13), PROP_COLORS.woodDark, [0.72, 0.5, 0]),
    tinted(new THREE.BoxGeometry(1.78, 1.12, 0.1), FRAME, [0, 1.22, 0]),
    tinted(new THREE.BoxGeometry(1.6, 0.94, 0.03), CORK, [0, 1.22, 0.05]),
    // Little sloped roof with a front lip.
    tinted(new THREE.BoxGeometry(1.9, 0.06, 0.5), FRAME, [0, 1.8, -0.06], [-0.42, 0, 0]),
    tinted(new THREE.BoxGeometry(1.9, 0.1, 0.08), FRAME, [0, 1.74, 0.14]),
  ]
  // Pinned papers: flat quads, slight rotations, a colored pin dot each.
  const SHEETS: Array<[number, number, number, string]> = [
    [-0.55, 1.45, 0.06, PAPER],
    [-0.1, 1.38, -0.09, PAPER],
    [0.42, 1.47, 0.1, PAPER_SHADE],
    [-0.42, 1.0, -0.05, PAPER_SHADE],
    [0.12, 1.02, 0.07, PAPER],
    [0.55, 0.98, -0.08, PAPER],
  ]
  SHEETS.forEach(([x, y, rz, shade], i) => {
    parts.push(tinted(new THREE.BoxGeometry(0.3, 0.38, 0.012), shade, [x, y, 0.07], [0, 0, rz]))
    parts.push(
      tinted(new THREE.SphereGeometry(0.02, 6, 4), PINS[i % PINS.length], [x + Math.sin(rz) * 0.15, y + 0.16, 0.085]),
    )
  })
  // Two curled corners: small angled flaps at sheet corners.
  parts.push(tinted(new THREE.BoxGeometry(0.1, 0.1, 0.012), PAPER_SHADE, [-0.44, 0.85, 0.085], [0.35, 0.5, 0.2]))
  parts.push(tinted(new THREE.BoxGeometry(0.09, 0.09, 0.012), PAPER, [0.66, 1.32, 0.085], [-0.3, -0.45, 0.15]))
  const merged = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  return [{ geometry: merged, material: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }) }]
}

/** Painter's easel (Paintings portal): a three-legged A-frame — two
 * front legs canted forward, one back leg canted back for the classic
 * tripod stance — a horizontal rail holding a blank canvas board leaned
 * back at a natural angle, and a small paint-tray ledge with a few
 * paint dabs. Faces local +z (north = the walking approach). ONE
 * vertex-tinted merged mesh. ~1.6 m tall. */
export function buildEasel(): PropPart[] {
  const tinted = (
    g: THREE.BufferGeometry,
    color: string,
    pos: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
  ) => {
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
  const WOOD = PROP_COLORS.woodDark
  const WOOD_LIGHT = PROP_COLORS.woodLight
  const CANVAS = PROP_COLORS.cream
  const DABS = [PROP_COLORS.ember, PROP_COLORS.lagoon, PROP_COLORS.frond]

  const parts: THREE.BufferGeometry[] = [
    // Two front legs, splayed and canted forward for stability.
    tinted(new THREE.CylinderGeometry(0.035, 0.045, 1.5, 6), WOOD, [-0.32, 0.7, 0.14], [0.16, 0, 0.1]),
    tinted(new THREE.CylinderGeometry(0.035, 0.045, 1.5, 6), WOOD, [0.32, 0.7, 0.14], [0.16, 0, -0.1]),
    // Back leg, canted further back — the classic easel tripod stance.
    tinted(new THREE.CylinderGeometry(0.035, 0.045, 1.55, 6), WOOD, [0, 0.73, -0.32], [-0.34, 0, 0]),
    // Horizontal rail the canvas rests on.
    tinted(new THREE.BoxGeometry(0.85, 0.07, 0.12), WOOD_LIGHT, [0, 0.55, 0.06]),
    // Small paint-tray ledge jutting forward off the rail.
    tinted(new THREE.BoxGeometry(0.5, 0.03, 0.16), WOOD_LIGHT, [0, 0.51, 0.2]),
    // Blank canvas board, leaned back against the front legs.
    tinted(new THREE.BoxGeometry(0.72, 0.92, 0.035), CANVAS, [0, 1.03, 0], [-0.12, 0, 0]),
    // Thin wood lip top and bottom holding the canvas.
    tinted(new THREE.BoxGeometry(0.78, 0.045, 0.05), WOOD, [0, 0.6, 0.02], [-0.12, 0, 0]),
    tinted(new THREE.BoxGeometry(0.78, 0.045, 0.05), WOOD, [0, 1.46, -0.05], [-0.12, 0, 0]),
  ]
  // Paint dabs on the tray.
  DABS.forEach((color, i) => {
    parts.push(
      tinted(new THREE.IcosahedronGeometry(0.035, 0), color, [-0.14 + i * 0.14, 0.545, 0.22], [0.3, i, 0.2]),
    )
  })
  const merged = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  return [{ geometry: merged, material: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }) }]
}

/** Mic stand (Covers portal): a slim dark tripod stand, a boom arm
 * angled up and out, and a chunky faceted mic head with a grille cap.
 * Faces local +z (north = the walking approach). ONE vertex-tinted
 * merged mesh. ~1.5 m tall. */
export function buildMicStand(): PropPart[] {
  const tinted = (
    g: THREE.BufferGeometry,
    color: string,
    pos: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
  ) => {
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
  const STAND = PROP_COLORS.slate
  const GRILLE = PROP_COLORS.stone

  // Geometry that MEETS: the pole rises from a round base plate (a
  // splayed tripod kept leaving legs hanging in mid-air), and the boom
  // and mic are positioned from the pole's actual top rather than by
  // eye — every joint below is computed from the one before it.
  const POLE_TOP = 1.3
  const BOOM_TILT = -0.85 // from vertical, toward +X
  const BOOM_LEN = 0.5
  const boomDir = new THREE.Vector3(Math.sin(-BOOM_TILT), Math.cos(BOOM_TILT), 0)
  const boomMid = boomDir.clone().multiplyScalar(BOOM_LEN / 2).add(new THREE.Vector3(0, POLE_TOP, 0))
  const boomEnd = boomDir.clone().multiplyScalar(BOOM_LEN).add(new THREE.Vector3(0, POLE_TOP, 0))

  const parts: THREE.BufferGeometry[] = [
    // Weighted base plate, and a collar where the pole enters it.
    tinted(new THREE.CylinderGeometry(0.22, 0.24, 0.055, 12), STAND, [0, 0.03, 0]),
    tinted(new THREE.CylinderGeometry(0.06, 0.075, 0.09, 8), STAND, [0, 0.09, 0]),
    // Pole, from the collar to POLE_TOP.
    tinted(new THREE.CylinderGeometry(0.024, 0.03, POLE_TOP - 0.09, 7), STAND, [
      0,
      (POLE_TOP + 0.09) / 2,
      0,
    ]),
    // Boom arm off the top, and a clutch at the joint.
    tinted(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 7), STAND, [0, POLE_TOP, 0], [0, 0, 0.6]),
    tinted(new THREE.CylinderGeometry(0.018, 0.021, BOOM_LEN, 6), STAND, boomMid.toArray() as [number, number, number], [0, 0, BOOM_TILT]),
    // Mic hanging off the end of the boom, pointing down at the singer.
    tinted(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 6), STAND, [boomEnd.x, boomEnd.y, 0]),
    tinted(new THREE.CylinderGeometry(0.055, 0.062, 0.19, 7), STAND, [
      boomEnd.x,
      boomEnd.y - 0.13,
      0,
    ]),
    tinted(new THREE.IcosahedronGeometry(0.062, 0), GRILLE, [boomEnd.x, boomEnd.y - 0.24, 0], [0.3, 0.5, 0]),
  ]
  const merged = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  return [{ geometry: merged, material: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }) }]
}

/** The moai (About portal; "hedge stone" is its historical id): a
 * ~2.9 m Easter-Island-style statue — elongated head with a heavy
 * brow, long wide-based nose, shadowed eye hollows, pursed lips, long
 * ears, a small torso with arms folded to the belly — facing local +z
 * (north = the walking approach after meridianYaw), with a few stones
 * scattered at the base. Weathered grey-green with lighter chips,
 * darker recesses. ONE vertex-tinted merged mesh. The hedge ring was
 * removed (Aiden's call — and its invisible arc-guards read as
 * getting stuck on nothing): ONE snug blocker on the statue itself,
 * walk-around free. */
export function buildHedgeStone(): PropPart[] {
  const tinted = (g: THREE.BufferGeometry, color: string, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) => {
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
  const STONE = '#8a9484'
  const CHIP = '#aab5a2'
  const SHADOW = '#69736a'
  const parts: THREE.BufferGeometry[] = [
    // Torso: rounded slab, arms as side slabs, hands meeting on the belly.
    tinted(new RoundedBoxGeometry(1.35, 1.25, 0.9, 2, 0.16), STONE, [0, 0.62, 0]),
    tinted(new RoundedBoxGeometry(0.22, 1.0, 0.5, 2, 0.08), STONE, [-0.72, 0.6, 0.05], [0, 0, 0.08]),
    tinted(new RoundedBoxGeometry(0.22, 1.0, 0.5, 2, 0.08), STONE, [0.72, 0.6, 0.05], [0, 0, -0.08]),
    tinted(new RoundedBoxGeometry(0.34, 0.16, 0.14, 2, 0.05), CHIP, [-0.22, 0.42, 0.47]),
    tinted(new RoundedBoxGeometry(0.34, 0.16, 0.14, 2, 0.05), CHIP, [0.22, 0.42, 0.47]),
    // Head: the elongated moai block, tilted back a touch (they gaze up).
    tinted(new RoundedBoxGeometry(1.1, 1.75, 1.0, 2, 0.18), STONE, [0, 2.0, -0.02], [-0.06, 0, 0]),
    // Brow: one heavy ridge across the face, proud of the surface.
    tinted(new RoundedBoxGeometry(1.0, 0.2, 0.22, 2, 0.06), STONE, [0, 2.62, 0.46], [-0.12, 0, 0]),
    // Eye hollows: darker recesses tucked under the brow.
    tinted(new THREE.BoxGeometry(0.34, 0.18, 0.1), SHADOW, [-0.26, 2.48, 0.48]),
    tinted(new THREE.BoxGeometry(0.34, 0.18, 0.1), SHADOW, [0.26, 2.48, 0.48]),
    // Nose: long shaft from the brow down to a wide base.
    tinted(new RoundedBoxGeometry(0.3, 0.95, 0.3, 2, 0.08), STONE, [0, 2.2, 0.52], [-0.1, 0, 0]),
    tinted(new RoundedBoxGeometry(0.5, 0.22, 0.3, 2, 0.08), STONE, [0, 1.82, 0.55]),
    // Lips: pursed — two thin wide bars with a shadow seam between.
    tinted(new RoundedBoxGeometry(0.66, 0.11, 0.16, 2, 0.04), STONE, [0, 1.56, 0.55]),
    tinted(new THREE.BoxGeometry(0.6, 0.03, 0.14), SHADOW, [0, 1.49, 0.55]),
    tinted(new RoundedBoxGeometry(0.66, 0.11, 0.16, 2, 0.04), STONE, [0, 1.42, 0.54]),
    // Long ears hugging the head sides.
    tinted(new RoundedBoxGeometry(0.14, 0.7, 0.3, 2, 0.05), STONE, [-0.6, 2.15, 0.1]),
    tinted(new RoundedBoxGeometry(0.14, 0.7, 0.3, 2, 0.05), STONE, [0.6, 2.15, 0.1]),
    // Weathered chips at the crown and shoulder.
    tinted(new THREE.IcosahedronGeometry(0.12, 0), CHIP, [0.3, 2.85, 0.2], [0.5, 0.2, 0]),
    tinted(new THREE.IcosahedronGeometry(0.09, 0), CHIP, [-0.4, 1.15, 0.3], [0.2, 1.1, 0.4]),
    tinted(new THREE.IcosahedronGeometry(0.08, 0), CHIP, [0.5, 0.35, -0.3], [1.3, 0.3, 0.8]),
  ]
  // Scattered stones at the base.
  for (let i = 0; i < 5; i++) {
    const a = 0.7 + i * 1.25
    parts.push(
      tinted(
        new THREE.DodecahedronGeometry(0.1 + (i % 2) * 0.05, 0),
        i % 2 === 0 ? STONE : CHIP,
        [Math.sin(a) * 1.0, 0.07, Math.cos(a) * 1.0],
        [i * 0.9, a, i * 1.2],
        [1.1, 0.7, 1],
      ),
    )
  }
  const merged = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  return [{ geometry: merged, material: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }) }]
}
