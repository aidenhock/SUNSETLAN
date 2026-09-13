import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useStore } from '../store/useStore'
import {
  AURORA_BASE_H,
  AURORA_QUAD_W,
  AURORA_QUADS,
  buildAuroraLayout,
} from './auroraLayout'
import { skyRuntime } from './useSkyState'

/**
 * The aurora australis (Antarctica life) — NO new shaders (the
 * two-shader rule stands): three curtains of 36 thin vertical quads,
 * all 108 of them in ONE InstancedMesh on a shared `PlaneGeometry`
 * whose VERTEX colours run bright green at the bottom, teal through the
 * middle and a dim violet fading to black at the top. Additive blending
 * makes black transparent, so the tops fade out without a single
 * per-vertex alpha.
 *
 * The curtains are planet-local, so they hang over the south cap the way
 * the sun hangs over longitude 0 — walk toward the pole and they rise
 * ahead of you. Layout (paths, altitudes, per-quad basis) is the pure
 * `auroraLayout` module; this file is only the animation.
 *
 * Per frame (scratch only): a two-term height wave stretches each quad,
 * a small lean rocks it about the path tangent, and a travelling
 * brightness wave rides `instanceColor`. Everything is scaled by
 * `skyRuntime.southMix`, so anywhere near the island it is invisible and
 * free.
 *
 * ONE draw call, not three. The brief allowed three (one mesh per
 * curtain) and the first build did exactly that — but a curtain is ~50 m
 * of sky, so its bounding sphere covers most of the cap and it never
 * frustum-culls from a camera standing under it; three meshes were three
 * draws, always. Merging the curtains into one instanced mesh costs
 * nothing visually (same geometry, same material, same per-instance
 * animation — the curtain index just becomes a phase offset) and bought
 * back the two calls the south cap needed to stay inside the budget.
 */

/** Material opacity at full southMix. Additive blending STACKS: quads
 *  overlap their neighbours by roughly half, so the sheet renders at
 *  around 1.5× this. 0.55 came back washing to white along the bright
 *  ridge — green satin, not sky. 0.4 keeps the glow translucent enough
 *  that stars still read through the dim parts of a curtain. */
const AURORA_OPACITY = 0.4

/** The shared quad: base at y = 0 so scale.y stretches it upward, with
 *  the colour ramp baked in — green foot, teal waist, violet head
 *  falling to black (= transparent under additive blending). */
function curtainGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(1, 1).toNonIndexed()
  geo.translate(0, 0.5, 0)
  geo.deleteAttribute('uv')
  const pos = geo.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const foot = new THREE.Color('#6cf5a8')
  const waist = new THREE.Color('#4fd6c8')
  const head = new THREE.Color('#3b2a6e')
  const top = new THREE.Color('#05030c')
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i), 0, 1)
    if (t < 0.33) c.lerpColors(foot, waist, t / 0.33)
    else if (t < 0.7) c.lerpColors(waist, head, (t - 0.33) / 0.37)
    else c.lerpColors(head, top, (t - 0.7) / 0.3)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

export function Aurora() {
  const mesh = useRef<THREE.InstancedMesh>(null)

  const { geo, mat, quads, bases, curtainOf } = useMemo(() => {
    const layout = buildAuroraLayout()
    const flat = layout.flatMap((c) => c.quads)
    const which = layout.flatMap((c, i) => c.quads.map(() => i))
    // Base orientation per quad, solved once: width along the path
    // tangent, height along the surface normal, face across both.
    const b = flat.map((q) => {
      const z = new THREE.Vector3().crossVectors(q.tangent, q.normal)
      const basis = new THREE.Matrix4().makeBasis(q.tangent, q.normal, z)
      return new THREE.Quaternion().setFromRotationMatrix(basis)
    })
    const m = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: AURORA_OPACITY,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    })
    return { geo: curtainGeometry(), mat: m, quads: flat, bases: b, curtainOf: which }
  }, [])

  const scratch = useMemo(
    () => ({
      o: new THREE.Object3D(),
      lean: new THREE.Quaternion(),
      axis: new THREE.Vector3(1, 0, 0),
      c: new THREE.Color(),
    }),
    [],
  )

  useFrame((state) => {
    const m = mesh.current
    if (!m) return
    const mix = skyRuntime.southMix
    // Over a hundred metres of planet away: nothing drawn, nothing done.
    if (mix < 0.02) {
      m.visible = false
      return
    }
    m.visible = true
    const t = state.clock.elapsedTime
    const tier = useStore.getState().qualityTier
    // Low tier keeps the FIRST curtain only — instanced count is a plain
    // number, so the other two simply stop being drawn.
    const count = tier === 'low' ? AURORA_QUADS : quads.length
    m.count = count
    mat.opacity = AURORA_OPACITY * mix

    for (let i = 0; i < count; i++) {
      const q = quads[i]
      const k = curtainOf[i]
      const hs = 1 + 0.35 * (Math.sin(i * 0.7 + t * 0.6) + 0.5 * Math.sin(i * 1.9 - t * 1.1))
      const lean = 0.08 * Math.sin(i * 0.41 + t * 0.75 + k)
      const o = scratch.o
      o.position.copy(q.position)
      o.quaternion.copy(bases[i])
      // Lean about the path tangent, which is this quad's own local +X.
      scratch.lean.setFromAxisAngle(scratch.axis, lean)
      o.quaternion.multiply(scratch.lean)
      o.scale.set(AURORA_QUAD_W, AURORA_BASE_H * Math.max(0.2, hs), 1)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)

      // Brightness: a slow travelling wave with a faster ripple on top.
      const b = THREE.MathUtils.clamp(
        0.675 + 0.325 * Math.sin(i * 0.33 - t * 0.9 + k * 2.1) + 0.18 * Math.sin(i * 1.15 + t * 2.4),
        0.35,
        1,
      )
      m.setColorAt(i, scratch.c.setScalar(b))
    }
    m.instanceMatrix.needsUpdate = true
    const col = m.instanceColor as THREE.InstancedBufferAttribute | null
    if (col) col.needsUpdate = true
  })

  return (
    // renderOrder 2, depthWrite off, depth test ON — the sorting rule
    // every transparent effect that can appear against the water follows.
    // frustumCulled false: the curtains wrap most of the cap's sky, so a
    // bounding sphere would intersect the frustum from anywhere down here
    // anyway, and the southMix gate is the real switch.
    <instancedMesh
      ref={mesh}
      args={[geo, mat, quads.length]}
      renderOrder={2}
      frustumCulled={false}
    />
  )
}
