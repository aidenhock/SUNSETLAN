import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { AIDEN } from '../content/characters'
import { placement } from '../content/placements'
import { latLongToUnit } from '../controls/planetMath'
import { buildNodes } from './BlockyCharacter'
import { blockers, PLANET_RADIUS } from './planetConfig'
import {
  buildBulletinBoard,
  buildCemetery,
  buildHeadstone,
  buildHedgeStone,
  buildMusicStereo,
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
  musicStereo: buildMusicStereo,
  logBench: buildLogBench,
  crate: buildCrate,
  rowboat: buildRowboat,
  tripod: buildTripod,
  mailbox: buildMailbox,
  palapa: buildPalapa,
  hedgeStone: buildHedgeStone,
  bulletinBoard: buildBulletinBoard,
  cemetery: buildCemetery,
  headstone: buildHeadstone,
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

/**
 * Memorial garden rebuild: the fence blockers must trace the visible
 * fence line and nothing else — the gate gap and the whole interior
 * have to stay walkable. Distances use the same great-circle arc
 * (acos(dot) × PLANET_RADIUS) the controller's own collision checks
 * use, so this is measuring the thing the player actually feels.
 */
describe('cemetery fence blockers leave the gate and interior clear', () => {
  const cem = placement('cemetery')
  const hd = (cem.size?.depthM ?? 0) / 2
  const mPerDegLat = (Math.PI * PLANET_RADIUS) / 180

  const arcDistM = (a: THREE.Vector3, b: THREE.Vector3) =>
    Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)) * PLANET_RADIUS

  it('no blocker lies within 1.2 m of the south gate centre', () => {
    // South edge, x = 0 in the plot's local frame: the middle of the gate.
    const gateUnit = latLongToUnit(cem.lat - hd / mPerDegLat, cem.long)
    for (const b of blockers) {
      expect(arcDistM(b.unit, gateUnit)).toBeGreaterThan(1.2)
    }
  })

  it('no blocker lies within 4 m of the plot interior centre', () => {
    const centerUnit = latLongToUnit(cem.lat, cem.long)
    for (const b of blockers) {
      expect(arcDistM(b.unit, centerUnit)).toBeGreaterThan(4)
    }
  })
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
