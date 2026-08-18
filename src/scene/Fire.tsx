import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mulberry32 } from '../audio/procedural'
import { latLongToUnit, meridianYaw, surfaceQuaternion } from '../controls/planetMath'
import { useStore } from '../store/useStore'
import { WIND_AXIS } from './Clouds'
import { bakeWarmTintToward } from './geometryUtils'
import { placement } from '../content/placements'
import { usePlacementRuntime } from './placementRuntime'
import { skyRuntime } from './useSkyState'
import { SurfaceGroup } from './SurfaceGroup'

/**
 * Fire 2.0 rebuild (CLAUDE.md Ambient life) — mesh animation only, NO
 * new shaders (the two-shader rule stands). Six overlapping flame
 * TONGUES of varied height/width/phase render as ONE InstancedMesh:
 * shared tapered faceted cone whose VERTEX colors run bright pale
 * yellow at the base through amber to orange tips (toneMapped:false —
 * the heart actually glows), each instance tinted, flickered, swayed,
 * and occasionally licking taller on its own seeds — the silhouette
 * never reads as one triangle. A small near-white heart cone sits low
 * in the flame. Embers ride two pooled Points clouds (small fast +
 * a few large slow, plus faint ash flecks and smoke), rising and
 * drifting on one wind, fading well above the flame; qualityTier-
 * gated. The point light's flicker follows the tongues' COMBINED
 * amplitude. renderOrder 2 everywhere: after the water (renderOrder
 * 1), still depth-tested against opaque terrain.
 * Draw calls: tongues(1) + heart(1) + points(2) = 4 (+light).
 */

interface Tongue {
  x: number
  z: number
  w: number // base width scale
  h: number // height scale
  phase: number
  speed: number
  tilt: number // outward lean
  tiltAz: number
}
const TONGUES: Tongue[] = [
  { x: 0, z: 0, w: 1.0, h: 1.0, phase: 0.0, speed: 11.3, tilt: 0.0, tiltAz: 0 },
  { x: 0.09, z: 0.04, w: 0.62, h: 0.72, phase: 1.7, speed: 13.1, tilt: 0.16, tiltAz: 0.42 },
  { x: -0.08, z: 0.07, w: 0.55, h: 0.6, phase: 3.1, speed: 12.2, tilt: 0.18, tiltAz: 2.4 },
  { x: -0.05, z: -0.09, w: 0.66, h: 0.78, phase: 4.4, speed: 10.4, tilt: 0.15, tiltAz: 4.1 },
  { x: 0.07, z: -0.07, w: 0.5, h: 0.55, phase: 5.6, speed: 14.0, tilt: 0.2, tiltAz: 5.3 },
  { x: 0.0, z: 0.1, w: 0.45, h: 0.62, phase: 2.5, speed: 12.7, tilt: 0.17, tiltAz: 1.5 },
]
/** Per-instance tint: center tongues run hotter (paler), outer deeper. */
const TONGUE_TINTS = ['#ffffff', '#ffe2c0', '#ffd4a8', '#ffddb4', '#ffcf9e', '#ffd8ae']

/** Tapered faceted cone with the base→tip gradient baked as vertex
 * colors: pale yellow heart → amber → orange tip. */
function tongueGeometry(): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(0.24, 1, 6, 3).toNonIndexed()
  geo.translate(0, 0.5, 0) // base at y=0 so scale.y stretches upward
  const pos = geo.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const base = new THREE.Color('#fff3c8')
  const mid = new THREE.Color('#ffb24a')
  const tip = new THREE.Color('#ff7a33')
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i), 0, 1)
    if (t < 0.45) c.lerpColors(base, mid, t / 0.45)
    else c.lerpColors(mid, tip, (t - 0.45) / 0.55)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

// Particle pools: small embers rise fast and HIGH, a few LARGE embers
// rise slow and live long, smoke drifts gray, ash flecks are dim,
// grey, and ride the cloud wind well above the flame before fading.
const SMALL = { embers: 12, smoke: 3, ash: 8 } // one Points (size 0.09)
const SMALL_COUNT = SMALL.embers + SMALL.smoke + SMALL.ash
const LARGE_COUNT = 3 // second Points (size 0.16)

/** THE cloud wind, expressed in the fire's local frame: the global
 * drift axis crossed with the fire's surface point gives the drift
 * velocity direction, pulled back through the same surfaceQuaternion +
 * meridianYaw the SurfaceGroup applies. Ash shares the sky's weather. */
const WIND = (() => {
  // Baked at import from the FILE's placement: an editor nudge of a few
  // metres cannot meaningfully change which way the ash drifts.
  const home = placement('campfire')
  const unit = latLongToUnit(home.lat, home.long)
  const vel = new THREE.Vector3().crossVectors(WIND_AXIS, unit).normalize().multiplyScalar(0.2)
  const frame = surfaceQuaternion(unit).multiply(
    new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      meridianYaw(home.lat, home.long),
    ),
  )
  return vel.applyQuaternion(frame.invert())
})()

// ---- the lit base (fire-base polish): teepee wood + stone ring ------
// Both bake a WARM VERTEX TINT toward the flame center so fire-facing
// faces glow instead of silhouetting (Lambert diffuse alone leaves the
// outward faces black at night); the wood material adds an emissive
// whose intensity flickers with the tongues' combined amplitude.
const FIRE_HEART = new THREE.Vector3(0, 0.45, 0)

/** Bake warmth toward the fire heart (shared helper; defaults
 * reproduce the original near-fire curve). */
function bakeFirelight(geo: THREE.BufferGeometry, base: string, warm: string, ambient = 0.15) {
  const baked = bakeWarmTintToward(geo, FIRE_HEART, base, warm, { ambient })
  geo.dispose()
  return baked
}

/** Teepee POINTING INWARD (Aiden's call): bases rest on the sand
 * OUTSIDE the fire, tips lean IN and meet over the heart — the
 * classic crossed-logs read. (The previous splay tilted the tops
 * outward: petals, not a teepee.) Warm bark, lighter end-grain caps,
 * per-log lean/length/roll variance; the meeting tips bake to ember
 * orange. ONE merged vertex-tinted geometry. */
function teepeeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  // Thicker per Aiden: r ~0.085–0.10 (the 0.06 sticks read twiggy).
  const LOGS = [
    { az: 0.4, lean: 0.62, len: 0.72, base: 0.44, r: 0.088, roll: 0.2 },
    { az: 1.75, lean: 0.68, len: 0.68, base: 0.42, r: 0.098, roll: 1.1 },
    { az: 3.0, lean: 0.6, len: 0.76, base: 0.46, r: 0.082, roll: 2.3 },
    { az: 4.25, lean: 0.66, len: 0.66, base: 0.41, r: 0.1, roll: 0.7 },
    { az: 5.45, lean: 0.63, len: 0.7, base: 0.43, r: 0.09, roll: 1.8 },
  ]
  for (const l of LOGS) {
    const dir = new THREE.Vector3(Math.cos(l.az), 0, Math.sin(l.az))
    // +lean tilts the log's TOP toward the center (−dir): base out,
    // tip in. Base sits at dir·base on the ground; the tip lands just
    // short of the axis so the five cross over the heart.
    const tilt = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(-dir.z, 0, dir.x), l.lean)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), l.roll))
    const m = new THREE.Matrix4().compose(
      dir
        .clone()
        .multiplyScalar(l.base - Math.sin(l.lean) * l.len * 0.5)
        .setY(l.len * 0.5 * Math.cos(l.lean) + 0.03),
      tilt,
      new THREE.Vector3(1, 1, 1),
    )
    const bark = bakeFirelight(new THREE.CylinderGeometry(l.r, l.r * 1.14, l.len, 6).applyMatrix4(m), '#96714a', '#f0a45c')
    parts.push(emberTips(bark))
    // Lighter end-grain caps on both cut faces.
    for (const endY of [l.len / 2, -l.len / 2]) {
      const cap = new THREE.CylinderGeometry(l.r * 1.02, l.r * 1.02, 0.028, 6)
      cap.translate(0, endY, 0)
      cap.applyMatrix4(m)
      parts.push(emberTips(bakeFirelight(cap, '#c99e6a', '#f6c088', 0.2)))
    }
  }
  return mergeParts(parts)
}

/** Second bake pass: vertices near the fire heart glow ember orange —
 * the tips inside the flame read as burning, never as dark holes. */
function emberTips(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute
  const col = g.attributes.color as THREE.BufferAttribute
  const ember = new THREE.Color('#ffc06a')
  const c = new THREE.Color()
  const p = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    const hot = THREE.MathUtils.clamp(1 - p.distanceTo(FIRE_HEART) / 0.32, 0, 1)
    if (hot <= 0) continue
    c.fromBufferAttribute(col, i).lerp(ember, hot * 0.9)
    col.setXYZ(i, c.r, c.g, c.b)
  }
  return g
}

/** A deliberate RING of 10 chunky rounded stones encircling the base —
 * even spacing with slight angular jitter, varied sizes, partially
 * sunk, warm-tinted on their fire-facing sides. One draw call. */
function stoneRingGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const COUNT = 10
  for (let i = 0; i < COUNT; i++) {
    const a = (i / COUNT) * Math.PI * 2 + ((i * 29) % 7) * 0.03 - 0.09
    // Chunky, thickened per Aiden: r 0.13–0.20.
    const r = 0.13 + ((i * 37) % 5) * 0.017
    const squash = 0.7 + ((i * 23) % 4) * 0.09
    const g = new THREE.DodecahedronGeometry(r, 0)
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(a) * 0.66, r * squash * 0.42, Math.sin(a) * 0.66),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(i * 0.7, a, i * 1.3)),
      new THREE.Vector3(1 + ((i * 13) % 3) * 0.12, squash, 1 - ((i * 7) % 3) * 0.07),
    )
    g.applyMatrix4(m)
    parts.push(bakeFirelight(g, '#c3bcae', '#f0b070', 0.06))
  }
  return mergeParts(parts)
}

/** Minimal non-indexed concat (all parts share position+normal+color). */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0
  for (const p of parts) count += p.attributes.position.count
  const out = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'color'] as const) {
    const arr = new Float32Array(count * 3)
    let off = 0
    for (const p of parts) {
      arr.set((p.attributes[name] as THREE.BufferAttribute).array as Float32Array, off)
      off += p.attributes[name].count * 3
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3))
  }
  for (const p of parts) p.dispose()
  return out
}

export function Fire() {
  // Follows its placement, so the dev editor can move it.
  const firePos = usePlacementRuntime((st) => st.list.find((p) => p.id === 'campfire')) ?? placement('campfire')

  const tongues = useRef<THREE.InstancedMesh>(null)
  const light = useRef<THREE.PointLight>(null)
  const smallPts = useRef<THREE.Points>(null)
  const largePts = useRef<THREE.Points>(null)
  const rng = useMemo(() => mulberry32(0xf1a3), [])

  const { tongueGeo, tongueMat } = useMemo(() => {
    const g = tongueGeometry()
    const m = new THREE.MeshBasicMaterial({
      vertexColors: true,
      toneMapped: false,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    })
    return { tongueGeo: g, tongueMat: m }
  }, [])

  const base = useMemo(() => {
    // ONE mesh for teepee + stone ring (draw-call budget: spawn sat AT
    // the 50-call line): the stones share the wood's flickering warm
    // emissive — a firepit's stones pulsing faintly with the flame
    // reads right, and the bake keeps their outer faces cool.
    const geo = mergeParts([teepeeGeometry(), stoneRingGeometry()])
    return {
      geo,
      mat: new THREE.MeshLambertMaterial({
        vertexColors: true,
        flatShading: true,
        emissive: new THREE.Color('#8a4a18'),
        emissiveIntensity: 0.15,
      }),
    }
  }, [])

  const pools = useMemo(() => {
    const mk = (count: number, size: number) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3).fill(9999), 3))
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
      const m = new THREE.PointsMaterial({
        size,
        transparent: true,
        depthWrite: false,
        vertexColors: true,
        toneMapped: false,
        sizeAttenuation: true,
      })
      // Manual bounds: live particles stay within ~5 m of the fire; the
      // 9999 parking position would otherwise blow the auto-computed
      // sphere up to never-cull (a draw call from across the planet).
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.6, 0), 5)
      return { g, m, life: new Float32Array(count).fill(-1), max: new Float32Array(count).fill(1) }
    }
    return { small: mk(SMALL_COUNT, 0.09), large: mk(LARGE_COUNT, 0.16) }
  }, [])

  const scratch = useMemo(
    () => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3(), p: new THREE.Vector3() }),
    [],
  )

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1) // resumed tabs hand the gap to frame 1
    const t = state.clock.elapsedTime

    // ---- tongues: per-instance seeded flicker/sway/lick ---------------
    let combined = 0
    const inst = tongues.current
    if (inst) {
      if (!inst.instanceColor) {
        // One-time per-instance tint: center tongues hotter, outer deeper.
        const c = new THREE.Color()
        for (let i = 0; i < TONGUES.length; i++) inst.setColorAt(i, c.set(TONGUE_TINTS[i]))
        if (inst.instanceColor) (inst.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true
      }
      for (let i = 0; i < TONGUES.length; i++) {
        const tg = TONGUES[i]
        const lick = Math.max(0, Math.sin(t * 0.9 + tg.phase * 1.7) - 0.86) * 3.6
        const flicker =
          1 +
          0.1 * Math.sin(t * tg.speed + tg.phase) +
          0.05 * Math.sin(t * (tg.speed * 1.57) + tg.phase * 2.2) +
          lick * 0.55
        combined += flicker
        const sway = 0.07 * Math.sin(t * 2.1 + tg.phase) + 0.035 * Math.sin(t * 5.3 + tg.phase * 3)
        scratch.e.set(
          Math.sin(tg.tiltAz) * tg.tilt,
          t * (0.3 + i * 0.11),
          Math.cos(tg.tiltAz) * tg.tilt + sway,
        )
        scratch.q.setFromEuler(scratch.e)
        scratch.s.set(tg.w * (1 + 0.05 * Math.sin(t * 9 + tg.phase)), tg.h * flicker, tg.w)
        // Base at 0.05 (was 0.16): ×1.4 group scale had the tongues
        // hovering ~0.12 m over the sand — the levitating-fire report.
        scratch.p.set(tg.x, 0.05, tg.z)
        scratch.m.compose(scratch.p, scratch.q, scratch.s)
        inst.setMatrixAt(i, scratch.m)
      }
      inst.instanceMatrix.needsUpdate = true
      combined /= TONGUES.length
      if (!inst.userData.bounded) {
        // One-time: bounds from live matrices (tongues stay within ~2 m
        // of the pit), then re-enable culling — the fire must not cost
        // a draw call from the far side of the planet.
        inst.computeBoundingSphere()
        inst.boundingSphere?.set(inst.boundingSphere.center, Math.max(inst.boundingSphere.radius, 2.5))
        inst.frustumCulled = true
        inst.userData.bounded = true
      }
    }
    if (light.current) {
      // Flicker amplitude synced to the tongues' combined amplitude.
      light.current.intensity = (1.4 + (combined - 1) * 6) * (0.35 + 0.65 * skyRuntime.nightMix)
    }
    // The base (teepee wood + pit stones) GLOWS with the same flicker
    // (night-weighted) — baked tint gives the warm side, this gives it
    // life.
    base.mat.emissiveIntensity =
      (0.12 + Math.max(0, combined - 1) * 0.5) * (0.35 + 0.65 * skyRuntime.nightMix)

    // ---- particles: two pooled clouds, one wind ----------------------
    const tier = useStore.getState().qualityTier
    const advance = (
      pool: { g: THREE.BufferGeometry; life: Float32Array; max: Float32Array },
      kindOf: (i: number) => 'ember' | 'largeEmber' | 'smoke' | 'ash',
    ) => {
      const pos = pool.g.attributes.position as THREE.BufferAttribute
      const col = pool.g.attributes.color as THREE.BufferAttribute
      for (let i = 0; i < pool.life.length; i++) {
        const kind = kindOf(i)
        if (pool.life[i] <= 0) {
          const spawnRate = kind === 'ember' ? 3.0 : kind === 'largeEmber' ? 0.5 : kind === 'smoke' ? 0.5 : 1.1
          // Low tier keeps a REDUCED pool — six small embers, no
          // ash/smoke/large — never an empty sky over the fire (the
          // old blanket gate zeroed the air on tier drops, which is
          // exactly what Aiden's sparse-star screenshot showed).
          if (tier === 'low' && !(kind === 'ember' && i < 6)) continue
          if (rng() > dt * spawnRate) continue
          // Longer lives = higher air: embers clear ~3 m over the flame,
          // ash rides the wind well above it before fading.
          pool.max[i] =
            kind === 'ember'
              ? 2.4 + rng() * 1.2
              : kind === 'largeEmber'
                ? 3.2 + rng() * 1.2
                : kind === 'smoke'
                  ? 2.4 + rng() * 1.2
                  : 4.0 + rng() * 1.5
          pool.life[i] = pool.max[i]
          pos.setXYZ(i, (rng() - 0.5) * 0.34, 0.5 + rng() * 0.4, (rng() - 0.5) * 0.34)
        }
        pool.life[i] -= dt
        if (pool.life[i] <= 0) {
          pos.setXYZ(i, 9999, 9999, 9999)
          col.setXYZ(i, 0, 0, 0)
        } else {
          const rise = kind === 'ember' ? 1.15 : kind === 'largeEmber' ? 0.6 : kind === 'smoke' ? 0.5 : 0.5
          // Ash rides the cloud wind hardest; embers mostly rise.
          const windK = kind === 'ash' ? 2.1 : kind === 'smoke' ? 1.3 : 1
          pos.setY(i, pos.getY(i) + dt * (rise + WIND.y * windK))
          pos.setX(i, pos.getX(i) + (WIND.x * windK + Math.sin(t * 3 + i * 2.2) * 0.1) * dt)
          pos.setZ(i, pos.getZ(i) + (WIND.z * windK + Math.cos(t * 2.6 + i * 1.7) * 0.08) * dt)
          const f = Math.min(1, pool.life[i] / (pool.max[i] * 0.55))
          if (kind === 'ember') col.setXYZ(i, 1.25 * f, 0.6 * f, 0.2 * f)
          else if (kind === 'largeEmber') col.setXYZ(i, 1.35 * f, 0.55 * f, 0.16 * f)
          else if (kind === 'smoke') col.setXYZ(i, 0.34 * f, 0.33 * f, 0.32 * f)
          else col.setXYZ(i, 0.36 * f, 0.34 * f, 0.31 * f) // ash: dim grey fleck
        }
      }
      pos.needsUpdate = true
      col.needsUpdate = true
      return pool.life.some((l) => l > 0)
    }
    const smallAlive = advance(pools.small, (i) =>
      i < SMALL.embers ? 'ember' : i < SMALL.embers + SMALL.smoke ? 'smoke' : 'ash',
    )
    const largeAlive = advance(pools.large, () => 'largeEmber')
    if (smallPts.current) smallPts.current.visible = smallAlive
    if (largePts.current) largePts.current.visible = largeAlive
  })

  return (
    <SurfaceGroup lat={firePos.lat} long={firePos.long}>
      {/* The lit base — world-scale (outside the flame's 1.4× group),
          opaque, normal render order: terrain rules apply. */}
      <mesh geometry={base.geo} material={base.mat} />
      <group scale={1.4}>
        {/* renderOrder 2: AFTER the water (renderOrder 1) — no depth
            write, so the transparent sea would otherwise stamp its
            horizon line through the flame. Depth test stays ON. */}
        <instancedMesh
          ref={tongues}
          args={[tongueGeo, tongueMat, TONGUES.length]}
          renderOrder={2}
          frustumCulled={false}
        />
        {/* Bright heart: small near-white core low in the flame. */}
        <mesh position={[0, 0.12, 0]} renderOrder={2}>
          <coneGeometry args={[0.11, 0.34, 5]} />
          <meshBasicMaterial color="#fff8e0" toneMapped={false} transparent opacity={0.96} depthWrite={false} />
        </mesh>
        <points ref={smallPts} geometry={pools.small.g} material={pools.small.m} renderOrder={2} />
        <points ref={largePts} geometry={pools.large.g} material={pools.large.m} renderOrder={2} />
      </group>
      {/* Campfire fix: decay 1.8 died by ~2.5 m — the seating logs at
          3.2 m got nothing. Gentler falloff + longer range carries the
          flicker to ~4 m; the baked log tint guarantees the warm read
          regardless. */}
      <pointLight ref={light} position={[0, 0.9, 0]} distance={13} decay={1.1} color="#ff9c50" />
    </SurfaceGroup>
  )
}
