import { KeyboardControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import Ecctrl, { type CustomEcctrlRigidBody } from 'ecctrl'
import { useRef } from 'react'
import { useStore } from '../store/useStore'

const SPAWN: [number, number, number] = [0, 2, 6]
const FALL_RESET_Y = -12

const keyboardMap = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'leftward', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'rightward', keys: ['ArrowRight', 'KeyD'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'run', keys: ['ShiftLeft', 'ShiftRight'] },
]

export function Player() {
  const body = useRef<CustomEcctrlRigidBody>(null)
  const modalOpen = useStore((s) => s.openModalId !== null)

  // No fail state: falling off the world teleports the player back to spawn.
  useFrame(() => {
    const rb = body.current?.group
    if (!rb) return
    const t = rb.translation()
    if (t.y < FALL_RESET_Y) {
      rb.setTranslation({ x: SPAWN[0], y: SPAWN[1], z: SPAWN[2] }, true)
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
      return
    }
    // hasMoved comes from actual displacement so it works for every input
    // method (keyboard, joystick, future gamepad) without event plumbing.
    if (!useStore.getState().hasMoved) {
      const dx = t.x - SPAWN[0]
      const dz = t.z - SPAWN[2]
      if (dx * dx + dz * dz > 0.25) useStore.getState().markMoved()
    }
  })

  return (
    <KeyboardControls map={keyboardMap}>
      <Ecctrl
        ref={body}
        position={SPAWN}
        disableControl={modalOpen}
        capsuleHalfHeight={0.35}
        capsuleRadius={0.3}
        floatHeight={0.3}
        maxVelLimit={4}
        sprintMult={1.8}
        camInitDis={-6}
        camMaxDis={-9}
        camMinDis={-2}
        // Spawn view faces the island interior (-Z), where the interactables are.
        camInitDir={{ x: 0.15, y: Math.PI }}
      >
        {/* Placeholder avatar: capsule + nose so facing direction reads. */}
        <group position={[0, -0.3, 0]}>
          <mesh>
            <capsuleGeometry args={[0.3, 0.7]} />
            <meshStandardMaterial color="#55a05f" flatShading />
          </mesh>
          <mesh position={[0, 0.35, 0.26]}>
            <boxGeometry args={[0.14, 0.14, 0.14]} />
            <meshStandardMaterial color="#14262b" flatShading />
          </mesh>
        </group>
      </Ecctrl>
    </KeyboardControls>
  )
}
