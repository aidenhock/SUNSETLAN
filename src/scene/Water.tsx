import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ISLAND_POLAR_DEG, PLANET_RADIUS } from './planetConfig'

/**
 * Sphere-wrapping ocean with cheap vertex waves: 2–3 summed sines displacing
 * along the normal in object space, so the waves are planet-local and rotate
 * with the world. Flat shading turns the displacement into visible facet
 * shimmer — no reflections, no postprocessing. Plus a thin animated foam
 * ring at the beach waterline.
 */
export function Water() {
  const foamRef = useRef<THREE.Mesh>(null)

  const waterMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#35a7a0',
      flatShading: true,
      transparent: true,
      opacity: 0.92,
    })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 }
      shader.vertexShader =
        'uniform float uTime;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float wave =
            sin(position.x * 0.35 + uTime * 1.1) +
            sin(position.z * 0.28 - uTime * 0.9) +
            sin((position.x + position.y) * 0.22 + uTime * 0.6);
          transformed += normalize(position) * wave * 0.04;`,
        )
      mat.userData.shader = shader
    }
    return mat
  }, [])

  useFrame((state) => {
    const shader = waterMaterial.userData.shader as { uniforms: { uTime: { value: number } } } | undefined
    if (shader) shader.uniforms.uTime.value = state.clock.elapsedTime
    const foam = foamRef.current
    if (foam) {
      const mat = foam.material as THREE.MeshBasicMaterial
      mat.opacity = 0.28 + 0.16 * Math.sin(state.clock.elapsedTime * 1.4)
      foam.scale.setScalar(1 + 0.0012 * Math.sin(state.clock.elapsedTime * 0.7))
    }
  })

  const foamTheta = THREE.MathUtils.degToRad(ISLAND_POLAR_DEG)
  return (
    <>
      <mesh material={waterMaterial}>
        <sphereGeometry args={[PLANET_RADIUS, 96, 48]} />
      </mesh>
      {/* Foam band hugging the waterline just above the wave crests' reach. */}
      <mesh ref={foamRef}>
        <sphereGeometry
          args={[PLANET_RADIUS + 0.16, 96, 2, 0, Math.PI * 2, foamTheta - 0.012, 0.028]}
        />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </>
  )
}
