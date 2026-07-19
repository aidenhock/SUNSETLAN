import { forwardRef } from 'react'
import * as THREE from 'three'
import { AIDEN } from '../content/characters'
import { controlsRuntime } from '../controls/usePlanetController'
import { BlockyCharacter, type MotionState } from './BlockyCharacter'

/** Stable reader — BlockyCharacter polls this every frame. controlsRuntime
 * already carries locomotion/airborne, so no per-frame object is allocated. */
const aidenMotion = (): MotionState => controlsRuntime

/**
 * Aiden: the BlockyCharacter chibi rig configured from content/characters.ts,
 * driven by the planet controller's locomotion state. The outer group is
 * owned by the controller (position.y + facing); the rig only animates the
 * body. Blob shadow grounds it without shadow maps.
 */
export const Avatar = forwardRef<THREE.Group>(function Avatar(_, ref) {
  return (
    <group ref={ref}>
      <BlockyCharacter config={AIDEN} motion={aidenMotion} />
      {/* Sits at 0.1 so the caps' ±0.12 vertex jitter can't poke through. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.1, 0]}>
        <circleGeometry args={[0.5, 20]} />
        <meshBasicMaterial color="#14262b" transparent opacity={0.22} depthWrite={false} />
      </mesh>
    </group>
  )
})
