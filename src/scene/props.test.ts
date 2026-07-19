import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { AIDEN } from '../content/characters'
import { buildNodes } from './BlockyCharacter'
import {
  buildBigTree,
  buildCampfire,
  buildCrate,
  buildLogBench,
  buildMailbox,
  buildPalapa,
  buildPalm,
  buildRock,
  buildRowboat,
  buildTripod,
  type PropPart,
} from './props'

/**
 * Regression guard: mergeGeometries returns null when pieces mix indexed and
 * non-indexed geometry (RoundedBox/Icosahedron are non-indexed, the rest are
 * indexed) — one null geometry aborts the whole render pass at runtime, which
 * no compile step catches. Every merged part must be a real geometry.
 */

const BUILDERS: Record<string, () => PropPart[]> = {
  palm: buildPalm,
  rock: buildRock,
  campfire: buildCampfire,
  logBench: buildLogBench,
  crate: buildCrate,
  rowboat: buildRowboat,
  tripod: buildTripod,
  mailbox: buildMailbox,
  palapa: buildPalapa,
  bigTree: buildBigTree,
}

describe('prop builders merge cleanly', () => {
  for (const [name, build] of Object.entries(BUILDERS)) {
    it(`${name}: every part is a valid non-indexed geometry`, () => {
      const parts = build()
      expect(parts.length).toBeGreaterThan(0)
      for (const p of parts) {
        expect(p.geometry).toBeInstanceOf(THREE.BufferGeometry)
        expect(p.geometry.attributes.position.count).toBeGreaterThan(0)
        expect(p.geometry.index).toBeNull()
        expect(p.material).toBeInstanceOf(THREE.MeshLambertMaterial)
      }
    })
  }
})

describe('BlockyCharacter nodes merge cleanly', () => {
  it('all four nodes exist with matching vertex colors', () => {
    const { nodes } = buildNodes(AIDEN)
    for (const key of ['torso', 'head', 'arm', 'leg'] as const) {
      const geo = nodes[key]
      expect(geo, `node ${key}`).toBeInstanceOf(THREE.BufferGeometry)
      const pos = geo.attributes.position.count
      expect(pos).toBeGreaterThan(0)
      expect(geo.attributes.color.count).toBe(pos)
    }
  })

  it('stays within the ~3k triangle character budget', () => {
    const { nodes } = buildNodes(AIDEN)
    // arm + leg render twice (mirrored pivots share the geometry).
    const tris =
      (nodes.torso.attributes.position.count +
        nodes.head.attributes.position.count +
        2 * nodes.arm.attributes.position.count +
        2 * nodes.leg.attributes.position.count) /
      3
    expect(tris).toBeLessThanOrEqual(3000)
  })
})
