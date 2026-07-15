import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { controlsRuntime } from '../controls/usePlanetController'
import { PLANET_RADIUS } from './planetConfig'

const DURATION = 0.9

/**
 * Expanding ring at the avatar's feet when the controller reports a
 * waterline crossing (controlsRuntime.wadeRippleTime). World-fixed at the
 * pole — the avatar never moves. Splash SFX joins in phase 3C with the
 * audio system.
 */
export function WadeRipple() {
  const ringRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    const ring = ringRef.current
    if (!ring) return
    const age = state.clock.elapsedTime - controlsRuntime.wadeRippleTime
    const active = controlsRuntime.wadeRippleTime > 0 && age >= 0 && age < DURATION
    ring.visible = active
    if (!active) return
    const t = age / DURATION
    ring.scale.setScalar(0.5 + t * 2.2)
    ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - t)
  })

  return (
    <mesh
      ref={ringRef}
      visible={false}
      rotation-x={-Math.PI / 2}
      position={[0, PLANET_RADIUS + 0.18, 0]}
    >
      <ringGeometry args={[0.75, 0.95, 28]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}
