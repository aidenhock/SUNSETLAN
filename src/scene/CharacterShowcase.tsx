import { Canvas, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'
import { AIDEN, KOA, NANUQ, ROSE, SILA, type CharacterConfig } from '../content/characters'
import { BlockyCharacter, type MotionState } from './BlockyCharacter'

/** The line-up, left to right. `&solo=<name>` centres one of them. */
const CAST: Array<{ name: string; config: CharacterConfig }> = [
  { name: 'aiden', config: AIDEN },
  { name: 'koa', config: KOA },
  { name: 'rose', config: ROSE },
  { name: 'nanuq', config: NANUQ },
  { name: 'sila', config: SILA },
]
/** Spacing between characters, metres. */
const GAP = 0.72

/**
 * ?chartest — dev/e2e-only isolated character viewer for the Character 2.0
 * sweep: the whole cast side by side on a plain ground, day lighting rig,
 * no planet. URL params drive the framing and pose so the e2e sweep is
 * deterministic:
 *   ?chartest&az=<deg>    camera azimuth around the line-up (0 = front)
 *   &pose=idle|walk|run|air
 *   &solo=<name>          one centered character (side-profile shots);
 *                         names are the CAST entries below
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
  const shown = solo ? CAST.filter((c) => c.name === solo) : CAST
  // Pull the camera back far enough to hold whoever is on stage.
  const dist = solo ? 3.0 : 3.4 + (shown.length - 2) * 0.72
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
        {shown.map((c, i) => (
          <group key={c.name} position={[(i - (shown.length - 1) / 2) * GAP, 0, 0]}>
            <BlockyCharacter config={c.config} motion={motion} />
          </group>
        ))}
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
