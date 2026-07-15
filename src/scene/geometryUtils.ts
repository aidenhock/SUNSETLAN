import * as THREE from 'three'

/**
 * Deterministic pseudo-noise from a position. Seam-duplicated sphere vertices
 * share coordinates, so they displace and tint identically — no cracks.
 */
function hashNoise(x: number, y: number, z: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 53.719) * 43758.5453
  return n - Math.floor(n)
}

/**
 * Handmade-terrain pass for the island caps: small radial vertex jitter
 * (visual only — well under the analytic step heights) plus per-vertex color:
 * low-frequency patches lerping toward `patchColor` and a fine brightness
 * speckle. No image textures; flat shading stays.
 */
export function jitterAndTint(
  geometry: THREE.BufferGeometry,
  options: {
    amplitude?: number
    baseColor: string
    patchColor: string
    /** Patch cell size in meters (bigger = broader patches). */
    patchSize?: number
    patchStrength?: number
    speckle?: number
    /** Fade all variation to zero toward the cap pole (radians): the sphere
     * cap's thin fan triangles turn any per-vertex noise into radial spokes. */
    poleFadeRad?: number
  },
): THREE.BufferGeometry {
  const {
    amplitude = 0.08,
    baseColor,
    patchColor,
    patchSize = 7,
    patchStrength = 0.5,
    speckle = 0.08,
    poleFadeRad = 0,
  } = options
  const pos = geometry.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const v = new THREE.Vector3()
  const base = new THREE.Color(baseColor)
  const patch = new THREE.Color(patchColor)
  const c = new THREE.Color()

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const len = v.length()
    const polar = len > 0 ? Math.acos(THREE.MathUtils.clamp(v.y / len, -1, 1)) : 0
    const fade =
      poleFadeRad > 0 ? THREE.MathUtils.smoothstep(polar, poleFadeRad * 0.15, poleFadeRad) : 1
    // Mostly smooth rolling bumps (summed sines) with a pinch of hash detail.
    // Pure per-vertex hash reads as crumpled paper on the thin pole-fan
    // triangles of a sphere cap; smooth displacement reads as turf/dunes.
    const rolling =
      (Math.sin(v.x * 0.9) + Math.sin(v.z * 1.1 + 2) + Math.sin((v.x + v.y) * 0.7 + 4)) / 3
    const jitter =
      fade *
      (rolling * amplitude * 0.75 + (hashNoise(v.x, v.y, v.z, 1) - 0.5) * amplitude * 0.5)
    if (len > 0) {
      v.multiplyScalar((len + jitter) / len)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    // Color variation stays low-frequency; strong per-vertex speckle streaks
    // along the pole fan. Smooth the cell value with a neighboring octave.
    const cell =
      0.5 * hashNoise(Math.round(v.x / patchSize), Math.round(v.y / patchSize), Math.round(v.z / patchSize), 7) +
      0.5 * hashNoise(Math.round(v.x / (patchSize * 2.7)), Math.round(v.y / (patchSize * 2.7)), Math.round(v.z / (patchSize * 2.7)), 11)
    const bright = 1 + (hashNoise(v.x, v.y, v.z, 3) - 0.5) * 2 * speckle * fade
    c.copy(base)
      .lerp(patch, cell * patchStrength * fade)
      .multiplyScalar(bright)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}
