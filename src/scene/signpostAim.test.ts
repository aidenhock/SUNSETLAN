import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { placement } from '../content/placements'
import { latLongToUnit } from '../controls/planetMath'
import { surfacePartMatrix } from './instancing'
import { bearingBetween, plank, SIGNPOST_TARGETS } from './signpost'

/**
 * Does each board actually point at its landmark?
 *
 * The earlier tests checked the plank against a hand-written idea of
 * which way local +X faced — and the code was written from the same
 * idea, so they agreed with each other and both were wrong. This one
 * takes no view on the frame at all: it pushes the plank through the
 * SAME `surfacePartMatrix` the scene uses, then compares where the tip
 * ends up against the great-circle direction to the real placement —
 * the point the editor's grab handle sits on. If the sign lies, this
 * fails, whatever the convention underneath.
 */

const V0 = new THREE.Vector3()
const IDENT = new THREE.Quaternion()

/**
 * The board's own axis in the post's local space: from its inner end to
 * its tip. Measuring the tip from the POST's centre instead would carry
 * the mount offset — the board hangs beside the post, not through it —
 * and read a degree off for reasons that have nothing to do with aim.
 */
function axisOf(bearing: number): { root: THREE.Vector3; tip: THREE.Vector3 } {
  const g = plank(0, 1, bearing, 0)
  const pos = g.attributes.position as THREE.BufferAttribute
  const flat: THREE.Vector3[] = []
  for (let i = 0; i < pos.count; i++) flat.push(new THREE.Vector3(pos.getX(i), 0, pos.getZ(i)))
  g.dispose()

  const dists = flat.map((v) => v.length())
  const near = Math.min(...dists)
  const far = Math.max(...dists)
  // AVERAGE the vertices at each end rather than taking one. A board is
  // 7 cm thick, so a single corner sits ~1° off the centre line over its
  // length — enough to fail a tight tolerance for reasons that have
  // nothing to do with which way the sign points.
  const meanOf = (target: number) => {
    const picked = flat.filter((_, i) => Math.abs(dists[i] - target) < 1e-3)
    const sum = picked.reduce((a, v) => a.add(v), new THREE.Vector3())
    return sum.multiplyScalar(1 / picked.length)
  }
  return { root: meanOf(near), tip: meanOf(far) }
}

describe('every board points at its landmark', () => {
  const post = placement('signpost')
  const postUnit = latLongToUnit(post.lat, post.long)
  const matrix = surfacePartMatrix(
    post.lat,
    post.long,
    0,
    (post.yawDeg * Math.PI) / 180,
    V0,
    IDENT,
    1,
  )

  for (const target of SIGNPOST_TARGETS) {
    it(`${target.id}`, () => {
      const place = placement(target.id)
      const bearing = bearingBetween(post, place)

      // The board's axis, in planet-local world space.
      const { root, tip } = axisOf(bearing)
      const tipWorld = tip
        .applyMatrix4(matrix)
        .sub(root.applyMatrix4(matrix))
      // Flatten onto the tangent plane: only the heading matters.
      tipWorld.addScaledVector(postUnit, -tipWorld.dot(postUnit)).normalize()

      // Where the landmark actually is, from the post.
      const want = latLongToUnit(place.lat, place.long)
      want.addScaledVector(postUnit, -want.dot(postUnit)).normalize()

      const agreement = tipWorld.dot(want)
      const offBy = (Math.acos(THREE.MathUtils.clamp(agreement, -1, 1)) * 180) / Math.PI
      expect(offBy, `${target.id} board is ${offBy.toFixed(2)}° off`).toBeLessThan(0.5)
    })
  }
})
