import { useFrame } from '@react-three/fiber'
import { forwardRef, useRef } from 'react'
import * as THREE from 'three'
import { AIDEN } from '../content/characters'
import { controlsRuntime } from '../controls/usePlanetController'
import { BlockyCharacter, type MotionState } from './BlockyCharacter'

/** Stable reader — BlockyCharacter polls this every frame. controlsRuntime
 * already carries locomotion/airborne/azimuth/yaw/pitch, so no per-frame
 * object is allocated. */
const aidenMotion = (): MotionState => controlsRuntime

/** Jump apex (m) from the controller's ballistics: v0² / 2g. */
const JUMP_APEX_M = (4.5 * 4.5) / (2 * 12)

/**
 * Aiden: the BlockyCharacter chibi rig configured from content/characters.ts,
 * driven by the planet controller. The controller owns the ref'd group
 * (position.y = ground + jump, facing); the rig only animates the body.
 *
 * The blob shadow is a SIBLING of that group (v3.4): it takes ground height
 * only — never jumpOffset — so it stays on the ground through a jump,
 * shrinking to ~60% and fading to ~50% at apex. Polygon offset wins the
 * depth fight against the terrain's jittered facets without visibly
 * floating. Future NPCs inherit these rules via the shared rig.
 */
export const Avatar = forwardRef<THREE.Group>(function Avatar(_, ref) {
  const shadow = useRef<THREE.Mesh>(null)

  useFrame(() => {
    const s = shadow.current
    if (!s) return
    s.position.y = controlsRuntime.groundY + 0.04
    const jumpNorm = THREE.MathUtils.clamp(controlsRuntime.jumpOffset / JUMP_APEX_M, 0, 1)
    const scale = 1 - 0.4 * jumpNorm
    s.scale.set(scale, scale, 1)
    ;(s.material as THREE.MeshBasicMaterial).opacity = 0.22 * (1 - 0.5 * jumpNorm)
  })

  return (
    <group>
      <group ref={ref}>
        <BlockyCharacter config={AIDEN} motion={aidenMotion} />
      </group>
      <mesh ref={shadow} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.5, 20]} />
        <meshBasicMaterial
          color="#14262b"
          transparent
          opacity={0.22}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
        />
      </mesh>
    </group>
  )
})
