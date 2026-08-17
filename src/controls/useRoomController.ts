import { useKeyboardControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { murals } from '../content/murals'
import { MOVE_SPEED, SPRINT_JOY_THRESHOLD, SPRINT_SPEED } from '../scene/planetConfig'
import { useStore } from '../store/useStore'
import { cameraRelativeMoveDir } from './planetMath'
import { controlsRuntime } from './usePlanetController'

/**
 * Walking inside the build-log room.
 *
 * The island's trick doesn't apply here — there is no sphere to rotate —
 * but the INVARIANT does: the avatar never moves. The room group slides
 * underneath it instead, so the camera rig, the jump math, the avatar
 * animation, and the footstep hooks all keep working untouched; only the
 * meaning of "where am I" changes, and that lives in `roomRuntime`.
 *
 * The room is a flat rectangle, so movement is plain 2D: a
 * camera-relative direction, a speed, and a clamp to the walls. Walls
 * clamp per axis (never cancel the whole step) so sliding along a wall
 * feels the same as sliding along a blocker on the island.
 */

/** Interior half-extents in metres (36 × 24 m room) and the wall inset. */
export const ROOM = {
  halfX: 18,
  halfZ: 12,
  /** How close the avatar's centre may get to a wall. */
  margin: 0.7,
  /** Where the player stands when they arrive — south of the rift. */
  spawn: { x: 0, z: 8 },
  /** The rift hangs at the centre; this is the "step back through" range. */
  exitRange: 2.8,
  /** Mural reading range, with the usual hysteresis on the way out. */
  muralRange: 4.6,
  muralExitRange: 5.4,
  /** Third-person camera clearance from the walls. */
  camClear: 0.5,
}

/**
 * Live room state, published for the scene, the minimap, and the HUD —
 * the room's equivalent of `controlsRuntime`'s lat/long.
 */
export const roomRuntime = {
  x: ROOM.spawn.x,
  z: ROOM.spawn.z,
  /** Body yaw in radians, world-space (same convention as the island). */
  yaw: 0,
  active: false,
}

const JUMP_V0 = 4.5
const JUMP_G = 12
const MAX_DT = 0.05

const _moveDir = new THREE.Vector3()
const _camDir = new THREE.Vector3()
/** Matches the island's follow distance (usePointerLockCamera CAM_DIST). */
const DEFAULT_CAM_DIST = 7

export function useRoomController({
  roomRef,
  avatarRef,
}: {
  roomRef: React.RefObject<THREE.Group | null>
  avatarRef: React.RefObject<THREE.Group | null>
}) {
  const [, getKeys] = useKeyboardControls()
  const yaw = useRef(0)
  const targetYaw = useRef(0)
  const jumpT = useRef<number | null>(null)
  const lastJump = useRef(false)
  /** Floor height in world Y, captured from wherever the player entered. */
  const floorY = useRef(0)
  const wasIn = useRef(false)

  useFrame((_state, rawDt) => {
    const room = roomRef.current
    const avatar = avatarRef.current
    const store = useStore.getState()
    if (!room || !avatar || !store.inRoom) {
      if (wasIn.current) {
        wasIn.current = false
        roomRuntime.active = false
        controlsRuntime.camDist = null // hand the camera back to the island
      }
      return
    }
    const dt = Math.min(rawDt, MAX_DT)

    // First frame inside: park the room at the avatar's feet and reset.
    if (!wasIn.current) {
      wasIn.current = true
      roomRuntime.active = true
      roomRuntime.x = ROOM.spawn.x
      roomRuntime.z = ROOM.spawn.z
      floorY.current = controlsRuntime.groundY
      jumpT.current = null
      yaw.current = controlsRuntime.avatarYaw
      targetYaw.current = yaw.current
    }

    // ---- input (same map, same sprint rule as the island) --------------
    const keys = getKeys()
    let ix = (keys.rightward ? 1 : 0) - (keys.leftward ? 1 : 0)
    let iz = (keys.forward ? 1 : 0) - (keys.backward ? 1 : 0)
    let sprinting = Boolean(keys.run)
    if (controlsRuntime.joyX !== 0 || controlsRuntime.joyY !== 0) {
      ix = controlsRuntime.joyX
      iz = controlsRuntime.joyY
      sprinting = Math.hypot(ix, iz) >= SPRINT_JOY_THRESHOLD
    }
    const inputActive = (ix !== 0 || iz !== 0) && !store.openModalId
    const speed = sprinting ? SPRINT_SPEED : MOVE_SPEED

    if (inputActive) {
      cameraRelativeMoveDir(ix, iz, controlsRuntime.azimuth, _moveDir)
      const mag = Math.min(1, Math.hypot(ix, iz))
      const step = speed * mag * dt
      // Per-axis clamp: walking into a wall diagonally still slides.
      roomRuntime.x = THREE.MathUtils.clamp(
        roomRuntime.x + _moveDir.x * step,
        -ROOM.halfX + ROOM.margin,
        ROOM.halfX - ROOM.margin,
      )
      roomRuntime.z = THREE.MathUtils.clamp(
        roomRuntime.z + _moveDir.z * step,
        -ROOM.halfZ + ROOM.margin,
        ROOM.halfZ - ROOM.margin,
      )
      targetYaw.current = Math.atan2(_moveDir.x, _moveDir.z)
      // Walking in here counts as walking: it clears the intro hint,
      // which the island's controller normally does.
      if (!store.hasMoved) store.markMoved()
    }

    // Shortest-arc yaw ease, same feel as the island controller.
    let delta = targetYaw.current - yaw.current
    delta = Math.atan2(Math.sin(delta), Math.cos(delta))
    yaw.current += delta * (1 - Math.exp(-dt / 0.09))
    roomRuntime.yaw = yaw.current

    // ---- jump (cosmetic, same arc as outside) --------------------------
    const jumpPressed = Boolean(keys.jump) && !store.openModalId
    if (jumpPressed && !lastJump.current && jumpT.current === null) jumpT.current = 0
    lastJump.current = jumpPressed
    let jumpOffset = 0
    if (jumpT.current !== null) {
      jumpT.current += dt
      jumpOffset = JUMP_V0 * jumpT.current - 0.5 * JUMP_G * jumpT.current * jumpT.current
      if (jumpOffset <= 0) {
        jumpOffset = 0
        jumpT.current = null
      }
    }

    // ---- place the world under the fixed avatar ------------------------
    room.position.set(-roomRuntime.x, floorY.current, -roomRuntime.z)
    avatar.position.y = floorY.current + jumpOffset
    avatar.rotation.y = yaw.current

    controlsRuntime.avatarYaw = yaw.current
    controlsRuntime.groundY = floorY.current
    controlsRuntime.jumpOffset = jumpOffset
    controlsRuntime.locomotion = !inputActive ? 'idle' : sprinting ? 'run' : 'walk'
    controlsRuntime.airborne = jumpT.current !== null
    controlsRuntime.seated = false

    // ---- keep the camera in the room -----------------------------------
    // Outside it would look through the (single-sided) walls at nothing.
    // March the follow ray backward to the first wall it would cross and
    // pull the camera in front of it — a plain third-person collision.
    cameraRelativeMoveDir(0, 1, controlsRuntime.azimuth, _camDir)
    let maxDist = DEFAULT_CAM_DIST
    const bx = -_camDir.x
    const bz = -_camDir.z
    if (Math.abs(bx) > 1e-4) {
      const wallX = bx > 0 ? ROOM.halfX : -ROOM.halfX
      maxDist = Math.min(maxDist, (wallX - roomRuntime.x) / bx - ROOM.camClear)
    }
    if (Math.abs(bz) > 1e-4) {
      const wallZ = bz > 0 ? ROOM.halfZ : -ROOM.halfZ
      maxDist = Math.min(maxDist, (wallZ - roomRuntime.z) / bz - ROOM.camClear)
    }
    controlsRuntime.camDist = Math.max(1.6, maxDist)

    // ---- proximity: the murals, and the rift you came in through -------
    if (!store.openModalId) {
      let nearest: string | null = null
      let bestDist = Infinity
      for (const m of murals) {
        const d = Math.hypot(m.at[0] - roomRuntime.x, m.at[1] - roomRuntime.z)
        if (d < bestDist) {
          bestDist = d
          nearest = m.id
        }
      }
      const holding = store.nearbyMural
      // Hysteresis: the prompt sticks until you clearly walk away.
      const range = holding === nearest ? ROOM.muralExitRange : ROOM.muralRange
      const wanted = nearest !== null && bestDist <= range ? nearest : null
      if (wanted !== holding) store.setNearbyMural(wanted)

      const atRift = Math.hypot(roomRuntime.x, roomRuntime.z) <= ROOM.exitRange
      if (atRift !== store.nearbyRoomExit) store.setNearbyRoomExit(atRift)
    }
  })
}
