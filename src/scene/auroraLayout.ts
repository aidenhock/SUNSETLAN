import * as THREE from 'three'
import { PLANET_RADIUS } from './planetConfig'

/**
 * Where the aurora hangs — the PURE half of `Aurora.tsx`, kept apart the
 * way `crabWalk` and `penguinWalk` are, so vitest can pin the geometry
 * (altitude band, polar band, a usable upright basis at every quad)
 * without a renderer or a React tree.
 */

/** Quads per curtain. */
export const AURORA_QUADS = 36
/** Base height of a quad, in metres, before the live height wave. */
export const AURORA_BASE_H = 9
/** Quad width, in metres. It has to beat the along-path SPACING with
 *  room to spare: at 2.1 m the first build came back as a chain of
 *  separate parallelograms with black gaps between them — a folded
 *  paper ribbon, not a curtain. Overlapping neighbours is what turns
 *  the instances into one shimmering sheet. */
export const AURORA_QUAD_W = 2.6

/**
 * The three curtains. Each sweeps `longSpan` degrees of longitude at a
 * polar angle (from the SOUTH pole) that wobbles about `spBase` — which
 * puts ~40° of great-circle arc in every curtain while keeping every
 * quad inside the 6°–24° band: overhead on the plateau, and low enough
 * toward the sea to be seen on the way in.
 */
const CURTAINS = [
  { long0: 340, longSpan: 150, spBase: 13, spAmp: 3.2, spFreq: 1.1, spPhase: 0.3, heightM: 27 },
  { long0: 90, longSpan: 160, spBase: 16, spAmp: 3.6, spFreq: 0.9, spPhase: 1.9, heightM: 30 },
  { long0: 200, longSpan: 140, spBase: 11, spAmp: 2.8, spFreq: 1.3, spPhase: 3.4, heightM: 32.5 },
]

export interface AuroraQuad {
  /** Planet-local position of the quad's BASE. */
  position: THREE.Vector3
  /** Along-path direction (the quad's width axis). */
  tangent: THREE.Vector3
  /** Outward surface normal (the quad stands up along this). */
  normal: THREE.Vector3
  /** Degrees from the SOUTH pole — the band the tests pin. */
  spDeg: number
}

export interface AuroraCurtain {
  quads: AuroraQuad[]
  radius: number
}

/** A point on one curtain's path, as a planet-local unit direction.
 *  Returns the polar angle from the SOUTH pole it landed at. */
function pathUnit(c: (typeof CURTAINS)[number], s: number, out: THREE.Vector3): number {
  const spDeg = c.spBase + c.spAmp * Math.sin(c.spFreq * Math.PI * 2 * s + c.spPhase)
  const longDeg = c.long0 + c.longSpan * s
  // sp is measured from the SOUTH pole, so the polar angle is π − sp.
  const polar = Math.PI - THREE.MathUtils.degToRad(spDeg)
  const lo = THREE.MathUtils.degToRad(longDeg)
  const sp = Math.sin(polar)
  out.set(sp * Math.sin(lo), Math.cos(polar), sp * Math.cos(lo))
  return spDeg
}

/** Where every quad of every curtain stands. Built once, at mount. */
export function buildAuroraLayout(): AuroraCurtain[] {
  const a = new THREE.Vector3()
  const b0 = new THREE.Vector3()
  const b1 = new THREE.Vector3()
  const ds = 1 / (AURORA_QUADS * 4)
  return CURTAINS.map((c) => {
    const radius = PLANET_RADIUS + c.heightM
    const quads: AuroraQuad[] = []
    for (let i = 0; i < AURORA_QUADS; i++) {
      const s = i / (AURORA_QUADS - 1)
      const spDeg = pathUnit(c, s, a)
      // Tangent by CENTRAL difference (a forward difference collapses to
      // zero at the last quad and hands the basis a NaN), then made
      // perpendicular to the normal so the quad stands truly upright.
      pathUnit(c, Math.max(0, s - ds), b0)
      pathUnit(c, Math.min(1, s + ds), b1)
      const normal = a.clone()
      const tangent = b1.clone().sub(b0).normalize()
      tangent.addScaledVector(normal, -tangent.dot(normal)).normalize()
      quads.push({ position: normal.clone().multiplyScalar(radius), tangent, normal, spDeg })
    }
    return { quads, radius }
  })
}
