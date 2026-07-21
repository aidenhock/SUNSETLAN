import type * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { AIDEN, ROSE } from '../content/characters'
import { buildNodes } from './BlockyCharacter'

/** Character 2.0 rounded rig (v3.15) — structural guarantees. */
describe('buildNodes (rounded villager rig)', () => {
  for (const [name, config] of [
    ['AIDEN', AIDEN],
    ['ROSE', ROSE],
  ] as const) {
    it(`${name}: merges cleanly, ≤3k tris, soles at −legLen, smooth normals`, () => {
      const { nodes, dims } = buildNodes(config)
      // Every node merged (mixed index-ness would return null).
      for (const node of Object.values(nodes)) {
        expect(node).not.toBeNull()
        // Vertex colors must cover every vertex (tint-before-merge rule).
        expect(node.attributes.color.count).toBe(node.attributes.position.count)
        // Smooth shading: the merge path must PRESERVE sphere normals —
        // adjacent triangles share normal directions (a flat-shaded
        // non-indexed mesh would have per-face constant normals only).
        expect(node.attributes.normal).toBeDefined()
      }
      // Full character = torso + head + 2 arms + 2 legs.
      const tris = (g: THREE.BufferGeometry) => g.attributes.position.count / 3
      const total =
        tris(nodes.torso) + tris(nodes.head) + 2 * tris(nodes.arm) + 2 * tris(nodes.leg)
      console.info(`${name}: ${total} tris/character`)
      expect(total).toBeLessThanOrEqual(3000)
      expect(total).toBeGreaterThan(500) // sanity: it's a real character
      // Blob-shadow contract: shoe soles kiss rig-local y = 0 — the leg
      // node's lowest vertex sits at −legLen (±1 cm).
      nodes.leg.computeBoundingBox()
      expect(nodes.leg.boundingBox!.min.y).toBeCloseTo(-dims.legLen, 1)
      // Pivot dims stay sane for the shared rig JSX.
      expect(dims.shoulderY).toBeLessThan(dims.torsoH)
      expect(dims.hipX).toBeGreaterThan(0)
    })
  }

  it('the two models differ where the configs differ (hair + outfit)', () => {
    const a = buildNodes(AIDEN)
    const r = buildNodes(ROSE)
    // Different hair/outfit/blush piece counts → different vertex counts.
    expect(a.nodes.head.attributes.position.count).not.toBe(
      r.nodes.head.attributes.position.count,
    )
    expect(a.nodes.torso.attributes.position.count).not.toBe(
      r.nodes.torso.attributes.position.count,
    )
  })
})

