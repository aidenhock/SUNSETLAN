import * as THREE from 'three'

/**
 * Deterministic pseudo-noise from a position. Seam-duplicated sphere vertices
 * share coordinates, so they displace identically — no cracks. Used for the
 * vertex jitter (which must be seam-safe) while face tones use the mulberry32
 * stream below, per playbook §3.
 */
function hashNoise(x: number, y: number, z: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 53.719) * 43758.5453
  return n - Math.floor(n)
}

/** Seeded PRNG (playbook §3) — one value per face, keyed by face order. */
function mulberry32(seed: number): () => number {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), s | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Fill a geometry's vertex-color attribute with one flat color so pieces of
 * different colors can merge into a single vertex-colored geometry (one draw
 * call per rigid node — used by BlockyCharacter).
 */
export function tintGeometry(geometry: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const color = new THREE.Color(hex)
  const count = geometry.attributes.position.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

export interface FacetTerrainOptions {
  /** Radial jitter amplitude in meters (visual only — keep < band steps). */
  amplitude?: number
  /** Base tone (also the tone everything fades to at the pole). */
  colorA: string
  /** Second tone: the other green on grass, the patch tan on sand. */
  colorB: string
  /** Cell size in meters for the broad patch noise. */
  patchSize?: number
  /** 0..1 — how much per-face alternation (vs broad patches) picks the tone.
   * High = lively AC-style two-tone tiling; low = irregular island patches. */
  checker?: number
  /** Tone threshold: higher bias → fewer colorB faces. */
  bias?: number
  /** Per-face brightness variation (±). */
  speckle?: number
  /** Fade jitter + tones to plain colorA toward the cap pole (radians): the
   * pole fan's thin triangles turn any variation into radial spokes. */
  poleFadeRad?: number
  seed?: number
}

/**
 * The style bible's terrain pass (playbook §3): strengthened seeded vertex
 * jitter for the handmade facet look, then per-face two-tone vertex colors —
 * the geometry is made non-indexed so each triangle owns its vertices and a
 * face's three vertices share ONE color: crisp facets, no bleeding. Flat
 * face normals come from computeVertexNormals on non-indexed geometry.
 * Render with MeshLambertMaterial({ vertexColors: true, flatShading: true }).
 * Analytic ground is unaffected (jitter < step height).
 */
export function facetTerrain(
  geometry: THREE.BufferGeometry,
  options: FacetTerrainOptions,
): THREE.BufferGeometry {
  const {
    amplitude = 0.12,
    colorA,
    colorB,
    patchSize = 7,
    checker = 0.5,
    bias = 0.5,
    speckle = 0.06,
    poleFadeRad = 0,
    seed = 1,
  } = options

  // Pass 1 — jitter the indexed geometry (seam vertices stay welded because
  // the noise is positional). Mostly smooth rolling bumps with a strong hash
  // share: the hash is what tilts facets for the chunky read.
  const pos = geometry.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  const fadeAt = (polar: number) =>
    poleFadeRad > 0 ? THREE.MathUtils.smoothstep(polar, poleFadeRad * 0.15, poleFadeRad) : 1
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const len = v.length()
    if (len === 0) continue
    const polar = Math.acos(THREE.MathUtils.clamp(v.y / len, -1, 1))
    const rolling =
      (Math.sin(v.x * 0.9) + Math.sin(v.z * 1.1 + 2) + Math.sin((v.x + v.y) * 0.7 + 4)) / 3
    const jitter =
      fadeAt(polar) *
      (rolling * amplitude * 0.4 + (hashNoise(v.x, v.y, v.z, seed) - 0.5) * amplitude * 1.2)
    v.multiplyScalar((len + jitter) / len)
    pos.setXYZ(i, v.x, v.y, v.z)
  }

  // Pass 2 — un-index so each triangle owns its vertices, then paint one
  // color per face: tone picked by face-index stream + broad cell noise.
  const nonIndexed = geometry.toNonIndexed()
  geometry.dispose()
  const p = nonIndexed.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(p.count * 3)
  const a = new THREE.Color(colorA)
  const b = new THREE.Color(colorB)
  const face = new THREE.Color()
  const centroid = new THREE.Vector3()
  const rand = mulberry32(seed * 7919)

  for (let f = 0; f < p.count / 3; f++) {
    const i0 = f * 3
    centroid
      .fromBufferAttribute(p, i0)
      .add(v.fromBufferAttribute(p, i0 + 1))
      .add(v.fromBufferAttribute(p, i0 + 2))
      .multiplyScalar(1 / 3)
    const stream = rand()
    const cell = hashNoise(
      Math.round(centroid.x / patchSize),
      Math.round(centroid.y / patchSize),
      Math.round(centroid.z / patchSize),
      seed + 7,
    )
    const tone = checker * stream + (1 - checker) * cell > bias ? b : a
    const polar = Math.acos(
      THREE.MathUtils.clamp(centroid.y / (centroid.length() || 1), -1, 1),
    )
    const fade = fadeAt(polar)
    const bright = 1 + (rand() - 0.5) * 2 * speckle * fade
    face
      .copy(a)
      .lerp(tone, fade)
      .multiplyScalar(bright)
    for (let k = 0; k < 3; k++) {
      colors[(i0 + k) * 3] = face.r
      colors[(i0 + k) * 3 + 1] = face.g
      colors[(i0 + k) * 3 + 2] = face.b
    }
  }
  nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  // Flat face normals fall out of non-indexed geometry automatically.
  nonIndexed.computeVertexNormals()
  return nonIndexed
}
