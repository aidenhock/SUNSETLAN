import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mulberry32 } from './geometryUtils'
import { normalizeForMerge } from './props'

/**
 * The rift (Fortnite-style tear in the sky): a blinding point with flat
 * crystalline shards flung radially out of it, hanging in the air over
 * the grass. Deliberately OFF the island's matte style — it is the one
 * thing here that isn't part of the world, and it should read that way.
 *
 * Four draw calls: merged shards, a slightly larger additive rim pass
 * that gives the shards their glowing cyan edges, the white-hot core,
 * and a soft glow disc. Everything is `MeshBasicMaterial` with
 * `toneMapped: false` — the rift is lit by itself, not by the sky, so
 * it looks identical at noon and at midnight.
 */

const SHARD_COLOR = new THREE.Color('#e8f4ff')
const SHARD_TIP = new THREE.Color('#8fd8ff')
const RIM_COLOR = '#5fd8ff'

/** One flat shard: an octahedron squashed into a sliver of glass. */
function shard(
  rng: () => number,
  angle: number,
  reach: number,
  length: number,
  width: number,
): THREE.BufferGeometry {
  const g = normalizeForMerge(new THREE.OctahedronGeometry(1, 0))
  g.scale(width, length, 0.035 + rng() * 0.03)
  // Tip-to-base gradient: the outer end catches more of the light.
  const pos = g.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) / length) * 0.5 + 0.5, 0, 1)
    c.copy(SHARD_COLOR).lerp(SHARD_TIP, t * 0.85)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  // Stand it off the core along its own axis, then swing it to `angle`
  // and give it a little out-of-plane tilt so the burst has depth.
  g.translate(0, reach + length, 0)
  g.rotateZ(angle)
  g.rotateY((rng() - 0.5) * 0.5)
  g.rotateX((rng() - 0.5) * 0.35)
  return g
}

function shardField(rng: () => number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = []
  // Eight big blades, unevenly spaced — an even fan reads as a flower.
  const BLADES = 8
  for (let i = 0; i < BLADES; i++) {
    const angle = (i / BLADES) * Math.PI * 2 + (rng() - 0.5) * 0.55
    parts.push(shard(rng, angle, 0.24 + rng() * 0.2, 0.5 + rng() * 0.62, 0.12 + rng() * 0.1))
  }
  // Splinters flung further out, filling the gaps between the blades.
  for (let i = 0; i < 10; i++) {
    const angle = rng() * Math.PI * 2
    parts.push(shard(rng, angle, 0.85 + rng() * 0.9, 0.1 + rng() * 0.22, 0.03 + rng() * 0.035))
  }
  return parts
}

/** The rift's parts carry unlit materials, unlike every island prop. */
export interface RiftPart {
  geometry: THREE.BufferGeometry
  material: THREE.MeshBasicMaterial
}

export function buildRift(): RiftPart[] {
  const rng = mulberry32(0x5121f7)
  const blades = shardField(rng)
  const shards = mergeGeometries(blades)!
  // The rim is the same field re-merged from a fresh seed-identical pass,
  // scaled up a hair and drawn additively behind — cheap glowing edges
  // without an outline shader.
  const rimRng = mulberry32(0x5121f7)
  const rimParts = shardField(rimRng)
  const rim = mergeGeometries(rimParts)!
  rim.scale(1.13, 1.13, 1.6)
  for (const g of [...blades, ...rimParts]) g.dispose()

  const core = normalizeForMerge(new THREE.IcosahedronGeometry(0.17, 1))
  const glow = normalizeForMerge(new THREE.CircleGeometry(1.15, 24))
  glow.translate(0, 0, -0.02)

  return [
    {
      geometry: shards,
      material: new THREE.MeshBasicMaterial({
        vertexColors: true,
        toneMapped: false,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
      }),
    },
    {
      geometry: rim,
      material: new THREE.MeshBasicMaterial({
        color: RIM_COLOR,
        toneMapped: false,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    },
    {
      geometry: core,
      material: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
    },
    {
      geometry: glow,
      material: new THREE.MeshBasicMaterial({
        color: '#9ee6ff',
        toneMapped: false,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    },
  ]
}
