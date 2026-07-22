import { Canvas, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'
import { AIDEN, ROSE } from '../content/characters'
import { BlockyCharacter, type MotionState } from './BlockyCharacter'

/**
 * ?chartest — dev/e2e-only isolated character viewer for the Character 2.0
 * sweep: both villager models side by side on a plain ground, day lighting
 * rig, no planet. URL params drive the framing and pose so the e2e sweep
 * is deterministic:
 *   ?chartest&az=<deg>    camera azimuth around the pair (0 = front)
 *   &pose=idle|walk|run|air
 *   &solo=aiden|rose      one centered character (side-profile shots)
 * The camera azimuth feeds MotionState, so the head look-at responds
 * exactly as in-game (the look-at demo IS an az sweep).
 */
export function CharacterShowcase() {
  const flags = new URLSearchParams(window.location.search)
  const azDeg = Number(flags.get('az') ?? '0')
  const pose = (flags.get('pose') ?? 'idle') as MotionState['locomotion'] | 'air'
  const solo = flags.get('solo')
  // &pitch= drives camPitch so max-deflection look-at states are testable.
  const camPitch = Number(flags.get('pitch') ?? '0.18')
  const az = THREE.MathUtils.degToRad(azDeg)
  const dist = 3.4
  const camPos: [number, number, number] = [Math.sin(az) * dist, 1.35, Math.cos(az) * dist]
  const motion = (): MotionState => ({
    locomotion: pose === 'air' ? 'idle' : pose,
    airborne: pose === 'air',
    azimuth: az,
    avatarYaw: 0,
    camPitch,
  })
  return (
    <div className="h-full w-full">
      <Canvas camera={{ fov: 45, near: 0.1, far: 50, position: camPos }}>
        <color attach="background" args={['#a8c6e8']} />
        <hemisphereLight args={['#bcd7f5', '#e8d8b0', 0.9]} />
        <directionalLight position={[3, 5, 4]} color="#ffd9a0" intensity={1.4} />
        <ambientLight intensity={0.25} />
        <CameraLook target={[0, 0.72, 0]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[6, 32]} />
          <meshLambertMaterial color="#e8c97a" />
        </mesh>
        {solo !== 'rose' && (
          <group position={[solo === 'aiden' ? 0 : -0.55, 0, 0]}>
            <BlockyCharacter config={AIDEN} motion={motion} />
          </group>
        )}
        {solo !== 'aiden' && (
          <group position={[solo === 'rose' ? 0 : 0.55, 0, 0]}>
            <BlockyCharacter config={ROSE} motion={motion} />
          </group>
        )}
      </Canvas>
    </div>
  )
}

/** Points the default camera at the pair's chest height once. */
function CameraLook({ target }: { target: [number, number, number] }) {
  const { camera } = useThree()
  useEffect(() => {
    camera.lookAt(...target)
  }, [camera, target])
  return null
}
