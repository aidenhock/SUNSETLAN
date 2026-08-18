import * as THREE from 'three'
import { buildBulletinBoard, buildHeadstone, buildHedgeStone, buildMailbox, buildMusicStereo, buildTripod, type PropPart } from './props'
import { PROP_REGISTRY } from './propRegistry'

/**
 * How wide a prop actually is, measured from the geometry it builds —
 * so a placement's blocker can default to the thing you can see rather
 * than a number someone guessed.
 *
 * The radius is the largest horizontal extent of the merged parts (x/z,
 * ignoring height), padded a little so the player stops just clear of
 * the mesh rather than clipping into it. Computed once per type, on
 * demand, because building a prop to measure it isn't free.
 */

/** Everything measurable: the instanced props plus the interactable bodies. */
const BUILDERS: Record<string, () => PropPart[]> = {
  ...PROP_REGISTRY,
  tripod: buildTripod,
  mailbox: buildMailbox,
  bulletin: buildBulletinBoard,
  hedgestone: buildHedgeStone,
  stereo: buildMusicStereo,
  headstone: buildHeadstone,
}

/** A little clearance so you brush past a prop instead of through it. */
const PAD_M = 0.25

const cache = new Map<string, number | null>()

export function footprintRadius(type: string): number | null {
  if (cache.has(type)) return cache.get(type)!
  const build = BUILDERS[type]
  if (!build) {
    cache.set(type, null)
    return null
  }
  let max = 0
  const parts = build()
  for (const part of parts) {
    part.geometry.computeBoundingBox()
    const box = part.geometry.boundingBox
    if (!box) continue
    // Horizontal reach only: a tall palm blocks like its trunk, not its
    // height, and the fronds overhead are not something you walk into.
    max = Math.max(
      max,
      Math.abs(box.min.x),
      Math.abs(box.max.x),
      Math.abs(box.min.z),
      Math.abs(box.max.z),
    )
  }
  // The instanced builders hand back shared geometry; leave it alone.
  const radius = max > 0 ? Math.round((max + PAD_M) * 100) / 100 : null
  cache.set(type, radius)
  return radius
}

/** The blocker a placement should have if nobody has hand-tuned it. */
export function autoBlockerRadius(type: string, scale: number): number | null {
  const base = footprintRadius(type)
  if (base === null) return null
  return Math.round(base * scale * 100) / 100
}

export const _resetFootprintCache = () => cache.clear()
export type { PropPart }
export const _scratch = new THREE.Vector3() // keeps three imported for types
