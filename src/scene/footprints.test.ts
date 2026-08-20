import { describe, expect, it } from 'vitest'
import { AIDEN } from '../content/characters'
import { buildNodes } from './BlockyCharacter'
import { footprintGeometry } from './Footprints'

/**
 * A footprint has to be the size of the foot that made it.
 *
 * The first version scaled the wrong axis of a circle — the axis that
 * gets flattened — leaving the other at its full unit diameter. The
 * prints shipped a METRE long, lying sideways across the beach. Nothing
 * but a measurement catches that, so here is the measurement, taken
 * against the character's actual shoe rather than a number in a comment.
 */

/** The shoe's footprint, measured off the rig the avatar is built from. */
function shoeExtent(): { width: number; length: number } {
  const { nodes } = buildNodes(AIDEN)
  const leg = nodes.leg
  leg.computeBoundingBox()
  const box = leg.boundingBox!
  return { width: box.max.x - box.min.x, length: box.max.z - box.min.z }
}

describe('footprints', () => {
  const geo = footprintGeometry()
  geo.computeBoundingBox()
  const box = geo.boundingBox!
  const width = box.max.x - box.min.x
  const length = box.max.z - box.min.z

  it('lies flat on the ground', () => {
    expect(box.max.y - box.min.y).toBeLessThan(1e-6)
  })

  it('is longer than it is wide, like a foot', () => {
    expect(length).toBeGreaterThan(width)
    expect(length / width).toBeLessThan(2) // a foot, not a ski
  })

  it('is no bigger than the shoe that pressed it', () => {
    const shoe = shoeExtent()
    expect(width).toBeLessThanOrEqual(shoe.width + 0.02)
    expect(length).toBeLessThanOrEqual(shoe.length + 0.02)
    // …and not so small it vanishes: at least half the shoe.
    expect(width).toBeGreaterThan(shoe.width * 0.5)
    expect(length).toBeGreaterThan(shoe.length * 0.5)
  })

  it('is measured in centimetres, not metres', () => {
    // The shipped bug: a 1 m dash. Anything over 30 cm is not a footprint.
    expect(length).toBeLessThan(0.3)
    expect(width).toBeLessThan(0.3)
  })
})
