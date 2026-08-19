import { useFrame } from '@react-three/fiber'
import { forwardRef, useRef } from 'react'
import * as THREE from 'three'
import { stepSound } from '../audio/footsteps'
import { AIDEN } from '../content/characters'
import { controlsRuntime } from '../controls/usePlanetController'
import { footprintQueue } from './Footprints'
import { BlockyCharacter, type MotionState } from './BlockyCharacter'
import { surfaceUnderfoot } from './planetConfig'

/** Stable reader — BlockyCharacter polls this every frame. controlsRuntime
 * already carries locomotion/airborne/azimuth/yaw/pitch, so no per-frame
 * object is allocated. */
const aidenMotion = (): MotionState => controlsRuntime

/** Foot plant → surface-switched step from the pools (3C), and a print
 *  in the sand: same event, so the trail lands in step with the gait. */
const aidenStep = () => {
  stepSound(
    surfaceUnderfoot(controlsRuntime.surfPolarDeg, controlsRuntime.surfLongDeg, controlsRuntime.wet),
    controlsRuntime.locomotion === 'run',
  )
  footprintQueue.press()
}

/** Jump apex (m) from the controller's ballistics: v0² / 2g. */
const JUMP_APEX_M = (4.5 * 4.5) / (2 * 12)

/** Seated-at-the-fire pose (3C sit system): thighs swing forward like
 * Koa's dock dangle but higher (log seat), knees apart a touch, arms
 * resting toward the lap, elbows soft. Blended in ~0.15 s over whatever
 * the shared animation produced — the idle bob keeps breathing and the
 * head look-at stays live (the hook never touches the head). */
const SEAT_POSE = { leg: -1.15, legSplay: 0.08, arm: -0.3, elbow: -0.5 }

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
  const seat = useRef({ blend: 0, lastT: 0 })

  const seatedPose: NonNullable<Parameters<typeof BlockyCharacter>[0]['poseHook']> = ({
    armL,
    armR,
    foreL,
    foreR,
    legL,
    legR,
    t,
  }) => {
    const s = seat.current
    const dt = Math.min(Math.max(t - s.lastT, 0), 0.05)
    s.lastT = t
    const target = controlsRuntime.seated ? 1 : 0
    s.blend += (target - s.blend) * (1 - Math.exp(-dt / 0.15))
    const b = s.blend
    if (b < 0.001) return
    legL.rotation.x = THREE.MathUtils.lerp(legL.rotation.x, SEAT_POSE.leg, b)
    legR.rotation.x = THREE.MathUtils.lerp(legR.rotation.x, SEAT_POSE.leg, b)
    legL.rotation.z = THREE.MathUtils.lerp(legL.rotation.z, -SEAT_POSE.legSplay, b)
    legR.rotation.z = THREE.MathUtils.lerp(legR.rotation.z, SEAT_POSE.legSplay, b)
    armL.rotation.x = THREE.MathUtils.lerp(armL.rotation.x, SEAT_POSE.arm, b)
    armR.rotation.x = THREE.MathUtils.lerp(armR.rotation.x, SEAT_POSE.arm, b)
    if (foreL) foreL.rotation.x = THREE.MathUtils.lerp(foreL.rotation.x, SEAT_POSE.elbow, b)
    if (foreR) foreR.rotation.x = THREE.MathUtils.lerp(foreR.rotation.x, SEAT_POSE.elbow, b)
  }

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
        <BlockyCharacter config={AIDEN} motion={aidenMotion} onStep={aidenStep} poseHook={seatedPose} />
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
