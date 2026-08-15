import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { tintGeometry } from './geometryUtils'

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
/** Hedge stone v2 (Aiden's call, with moai references): a ~2.9 m
 * Easter-Island-style statue — elongated head with a heavy brow, long
 * wide-based nose, shadowed eye hollows, pursed lips, long ears, a
 * small torso with arms folded to the belly — facing local +z (north =
 * the walking approach after meridianYaw), inside a bigger two-green
 * hedge ring (r ~2.2 m) whose opening faces the same way. Weathered
 * grey-green with lighter chips, darker recesses. ONE vertex-tinted
 * merged mesh. Blockers: the statue base takes the interactable's own
 * radius; three landmark arc-guards cover the ring's flanks and rear
 * so players enter through the opening instead of over the hedge. */
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
  const HEDGE_A = '#55a05f'
  const HEDGE_B = '#3f8a4b'
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
  // Hedge ring, radius ~2.2 m, opening toward +z (the approach):
  // chunky rounded blocks alternating two greens, slight size jitter.
  const BLOCKS = 11
  for (let i = 0; i < BLOCKS; i++) {
    // Span the circle EXCEPT a ~95° opening centered on +z.
    const a = Math.PI / 2 + 0.83 + (i / (BLOCKS - 1)) * (Math.PI * 2 - 1.66)
    const w = 0.85 + ((i * 23) % 3) * 0.1
    const h = 0.48 + ((i * 31) % 3) * 0.08
    parts.push(
      tinted(
        new RoundedBoxGeometry(w, h, 0.55, 2, 0.12),
        i % 2 === 0 ? HEDGE_A : HEDGE_B,
        [Math.sin(a) * 2.2, h / 2 - 0.05, Math.cos(a) * 2.2],
        [0, -a + ((i * 13) % 5) * 0.04, 0],
      ),
    )
  }
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
