import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mulberry32 } from '../audio/procedural'
import { useStore } from '../store/useStore'
import { placement } from '../content/placements'
import { usePlacementRuntime } from './placementRuntime'
import { skyRuntime } from './useSkyState'
import { SurfaceGroup } from './SurfaceGroup'

/**
 * The memorial garden's night mood (TASK 3): two very low warm glow
 * points near the stones (scaled with nightMix — never bright; this
 * space reads QUIET) and pooled firefly quads drifting slowly inside
 * the walls, night- and qualityTier-gated. One Points draw + two
 * lights; the static prop set renders from Island.
 */

const COUNT = 12
const AREA = 2.4 // fireflies wander a soft disc inside the walls

export function Cemetery() {
  // Follows its placement, so the dev editor can move it.
  const plot = usePlacementRuntime((st) => st.list.find((p) => p.id === 'cemetery')) ?? placement('cemetery')

  const points = useRef<THREE.Points>(null)
  const lightA = useRef<THREE.PointLight>(null)
  const lightB = useRef<THREE.PointLight>(null)
  const rng = useMemo(() => mulberry32(0xce3e7e), [])

  const { geo, mat, seeds } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3).fill(9999), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), AREA + 2)
    const m = new THREE.PointsMaterial({
      size: 0.07,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      toneMapped: false,
      sizeAttenuation: true,
    })
    const s = Array.from({ length: COUNT }, () => ({
      cx: (rng() - 0.5) * AREA * 2,
      cz: (rng() - 0.5) * AREA * 2 - 0.4,
      r: 0.3 + rng() * 0.6,
      speed: 0.15 + rng() * 0.25,
      phase: rng() * Math.PI * 2,
      bob: 0.4 + rng() * 0.5,
      blink: 0.5 + rng() * 1.2,
    }))
    return { geo: g, mat: m, seeds: s }
  }, [rng])

  useFrame((state, rawDt) => {
    void Math.min(rawDt, 0.1)
    const t = state.clock.elapsedTime
    const night = THREE.MathUtils.smoothstep(skyRuntime.nightMix, 0.45, 0.8)
    const tier = useStore.getState().qualityTier
    const active = night > 0.02 && tier !== 'low'
    if (points.current) points.current.visible = active
    if (lightA.current) lightA.current.intensity = 0.35 * night
    if (lightB.current) lightB.current.intensity = 0.28 * night
    if (!active) return
    const pos = geo.attributes.position as THREE.BufferAttribute
    const col = geo.attributes.color as THREE.BufferAttribute
    for (let i = 0; i < COUNT; i++) {
      const s = seeds[i]
      const a = s.phase + t * s.speed
      pos.setXYZ(
        i,
        s.cx + Math.cos(a) * s.r,
        0.5 + Math.sin(t * s.bob + s.phase) * 0.3,
        s.cz + Math.sin(a) * s.r,
      )
      // Soft blink, warm green-gold, scaled by night.
      const glow = (0.35 + 0.65 * Math.max(0, Math.sin(t * s.blink + s.phase * 3))) * night
      col.setXYZ(i, 0.72 * glow, 0.85 * glow, 0.38 * glow)
    }
    pos.needsUpdate = true
    col.needsUpdate = true
  })

  return (
    <SurfaceGroup lat={plot.lat} long={plot.long}>
      <points ref={points} geometry={geo} material={mat} renderOrder={2} />
      <pointLight ref={lightA} position={[-0.8, 0.5, -1.4]} distance={4} decay={1.4} color="#ffca8a" />
      <pointLight ref={lightB} position={[1.0, 0.5, -1.2]} distance={4} decay={1.4} color="#ffca8a" />
    </SurfaceGroup>
  )
}
