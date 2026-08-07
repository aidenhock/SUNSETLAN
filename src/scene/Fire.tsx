import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mulberry32 } from '../audio/procedural'
import { useStore } from '../store/useStore'
import { MAP } from './planetConfig'
import { skyRuntime } from './useSkyState'
import { SurfaceGroup } from './SurfaceGroup'

/**
 * Fire 2.0 (CLAUDE.md Ambient life) — mesh animation like the clouds,
 * NO new shaders (the two-shader rule stands): three layered faceted
 * cones (orange shell → amber mid → near-white core, toneMapped:false
 * so the flame colors are WYSIWYG) animated in useFrame with seeded
 * sin-noise — flicker scale, gentle sway, an occasional taller lick.
 * Embers AND smoke share ONE Points cloud (embers glow-warm rising
 * fast; smoke puffs gray, slower, higher), planet-local,
 * qualityTier-gated. The point light's flicker amplitude syncs to the
 * flame's live scale. Whole fire ~1.4× the old prop flame.
 * Draw calls: 3 cones + 1 points + light = +3 meshes vs the removed
 * prop flame piece.
 */

const FLAME_LAYERS = [
  { color: '#ff7a33', r: 0.34, h: 0.78, y: 0.5 },
  { color: '#ffb060', r: 0.22, h: 0.58, y: 0.44 },
  { color: '#fff3d6', r: 0.12, h: 0.36, y: 0.36 },
] as const

const PARTICLES = 10 // 7 embers + 3 smoke puffs
const EMBERS = 7

export function Fire() {
  const cones = useRef<Array<THREE.Mesh | null>>([null, null, null])
  const light = useRef<THREE.PointLight>(null)
  const points = useRef<THREE.Points>(null)
  const rng = useMemo(() => mulberry32(0xf1a3), [])

  const { geo, mat, life } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICLES * 3).fill(9999), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(PARTICLES * 3), 3))
    const m = new THREE.PointsMaterial({
      size: 0.09,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      toneMapped: false,
      sizeAttenuation: true,
    })
    return { geo: g, mat: m, life: new Float32Array(PARTICLES).fill(-1) }
  }, [])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1) // resumed tabs hand the gap to frame 1
    const t = state.clock.elapsedTime
    // Seeded sin-noise flicker: base scale + jitter + occasional lick
    // (slow beat swelling the flame taller for a moment).
    const lick = Math.max(0, Math.sin(t * 0.9) - 0.82) * 3.2
    const flicker =
      1 +
      0.09 * Math.sin(t * 11.3) +
      0.05 * Math.sin(t * 17.7 + 1.4) +
      lick * 0.5
    const sway = 0.06 * Math.sin(t * 2.1) + 0.03 * Math.sin(t * 5.3)
    for (let i = 0; i < 3; i++) {
      const cone = cones.current[i]
      if (!cone) continue
      const layerJitter = 1 + 0.05 * Math.sin(t * (13 + i * 3.1) + i * 2)
      cone.scale.set(layerJitter, flicker * layerJitter, layerJitter)
      cone.rotation.z = sway * (1 - i * 0.25)
      cone.rotation.y = t * (0.4 + i * 0.25)
    }
    if (light.current) {
      // Flicker amplitude synced to the live flame scale.
      light.current.intensity = (1.4 + (flicker - 1) * 6) * (0.35 + 0.65 * skyRuntime.nightMix)
    }

    // Embers + smoke: one pooled Points cloud.
    const tier = useStore.getState().qualityTier
    const pos = geo.attributes.position as THREE.BufferAttribute
    const col = geo.attributes.color as THREE.BufferAttribute
    for (let i = 0; i < PARTICLES; i++) {
      const isEmber = i < EMBERS
      if (life[i] <= 0) {
        if (tier === 'low' || rng() > dt * (isEmber ? 1.6 : 0.5)) continue
        life[i] = isEmber ? 0.9 + rng() * 0.7 : 2.2 + rng() * 1.2
        pos.setXYZ(i, (rng() - 0.5) * 0.3, 0.6 + rng() * 0.3, (rng() - 0.5) * 0.3)
      }
      life[i] -= dt
      if (life[i] <= 0) {
        pos.setXYZ(i, 9999, 9999, 9999)
        col.setXYZ(i, 0, 0, 0)
      } else {
        const rise = isEmber ? 1.1 : 0.55
        pos.setY(i, pos.getY(i) + dt * rise)
        pos.setX(i, pos.getX(i) + Math.sin(t * 3 + i * 2.2) * dt * 0.12)
        const f = Math.min(1, life[i] / 0.8)
        if (isEmber) col.setXYZ(i, 1.2 * f, 0.55 * f, 0.18 * f)
        else col.setXYZ(i, 0.36 * f, 0.35 * f, 0.34 * f)
      }
    }
    pos.needsUpdate = true
    col.needsUpdate = true
    if (points.current) points.current.visible = life.some((l) => l > 0)
  })

  return (
    <SurfaceGroup lat={MAP.campfire.lat} long={MAP.campfire.long}>
      {/* ~1.4× the old prop flame. */}
      <group scale={1.4}>
        {/* renderOrder 2: AFTER the water (renderOrder 1) — the flame
            writes no depth, so the transparent sea would otherwise
            stamp its horizon line straight through it. depthTest stays
            ON: opaque terrain/ocean-floor still occlude a flame that
            is genuinely behind them. */}
        {FLAME_LAYERS.map((l, i) => (
          <mesh key={i} ref={(m) => void (cones.current[i] = m)} position={[0, l.y, 0]} renderOrder={2}>
            <coneGeometry args={[l.r, l.h, 5]} />
            <meshBasicMaterial color={l.color} toneMapped={false} transparent opacity={i === 0 ? 0.85 : 0.95} depthWrite={false} />
          </mesh>
        ))}
        <points ref={points} geometry={geo} material={mat} renderOrder={2} />
      </group>
      <pointLight ref={light} position={[0, 0.9, 0]} distance={9} decay={1.8} color="#ff9c50" />
    </SurfaceGroup>
  )
}
