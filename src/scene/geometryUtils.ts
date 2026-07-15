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
  },
): THREE.BufferGeometry {
  const {
    amplitude = 0.08,
    baseColor,
    patchColor,
    patchSize = 7,
    patchStrength = 0.5,
    speckle = 0.08,
  } = options
  const pos = geometry.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const v = new THREE.Vector3()
  const base = new THREE.Color(baseColor)
  const patch = new THREE.Color(patchColor)
  const c = new THREE.Color()

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const jitter = (hashNoise(v.x, v.y, v.z, 1) - 0.5) * 2 * amplitude
    const len = v.length()
    if (len > 0) {
      v.multiplyScalar((len + jitter) / len)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    const cell = hashNoise(
      Math.round(v.x / patchSize),
      Math.round(v.y / patchSize),
      Math.round(v.z / patchSize),
      7,
    )
    const bright = 1 + (hashNoise(v.x, v.y, v.z, 3) - 0.5) * 2 * speckle
    c.copy(base)
      .lerp(patch, cell * patchStrength)
      .multiplyScalar(bright)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}
