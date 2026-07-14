import { useKeyboardControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { interactables } from '../content/interactables'
import {
  blockers,
  INTERACT_ARC_M,
  MAX_POLAR_RAD,
  MOVE_SPEED,
  PLANET_RADIUS,
} from '../scene/planetConfig'
import { useStore } from '../store/useStore'
import {
  angularDistanceToPole,
  applyStep,
  cameraRelativeMoveDir,
  polarAngle,
  rotationStep,
} from './planetMath'

/**
 * Mutable per-frame input shared between the control hooks without causing
 * React renders. The camera hook writes `azimuth`; TouchJoystick writes the
 * joystick vector.
 */
export const controlsRuntime = {
  joyX: 0,
  joyY: 0,
  azimuth: 0,
}

const JUMP_V0 = 4.5
const JUMP_G = 12
const MAX_DT = 0.05

interface ControllerRefs {
  planetRef: React.RefObject<THREE.Group | null>
  avatarRef: React.RefObject<THREE.Group | null>
  /** Low-poly collision meshes only — never the visual prop set. */
  collisionRefs: React.MutableRefObject<(THREE.Mesh | null)[]>
}

/**
 * The planet controller. The avatar is kinematic at the world pole; input
 * rotates the planet group's quaternion. See planetMath.ts for the math.
 */
export function usePlanetController({ planetRef, avatarRef, collisionRefs }: ControllerRefs) {
  const [, getKeys] = useKeyboardControls()

  const quat = useRef(new THREE.Quaternion())
  const movedAccum = useRef(0)
  const jumpT = useRef<number | null>(null) // seconds since jump start, null = grounded
  const yaw = useRef(0)

  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const rayOrigin = useMemo(() => new THREE.Vector3(), [])
  const RAY_DOWN = useMemo(() => new THREE.Vector3(0, -1, 0), [])
  const interactableUnits = useMemo(
    () =>
      interactables.map((def) => ({
        id: def.id,
        unit: new THREE.Vector3(...def.position).normalize(),
      })),
    [],
  )

  useFrame((_, rawDt) => {
    const planet = planetRef.current
    const avatar = avatarRef.current
    if (!planet || !avatar) return
    const dt = Math.min(rawDt, MAX_DT)
    const store = useStore.getState()

    // ---- input → tentative rotation step -------------------------------
    const keys = getKeys()
    let ix = (keys.rightward ? 1 : 0) - (keys.leftward ? 1 : 0)
    let iz = (keys.forward ? 1 : 0) - (keys.backward ? 1 : 0)
    if (controlsRuntime.joyX !== 0 || controlsRuntime.joyY !== 0) {
      ix = controlsRuntime.joyX
      iz = controlsRuntime.joyY
    }
    const inputActive = (ix !== 0 || iz !== 0) && !store.openModalId

    if (inputActive) {
      const moveDir = cameraRelativeMoveDir(ix, iz, controlsRuntime.azimuth)
      if (moveDir.lengthSq() > 0) {
        const inputMag = Math.min(1, Math.hypot(ix, iz))
        const angle = (MOVE_SPEED * inputMag * dt) / PLANET_RADIUS
        const candidate = applyStep(quat.current, rotationStep(moveDir, angle))

        // Island bounds: cancel steps that leave the cap (allow walking back in).
        const oldPolar = polarAngle(quat.current)
        const newPolar = polarAngle(candidate)
        let blocked = newPolar > MAX_POLAR_RAD && newPolar > oldPolar

        // Prop blockers: cancel steps that push into a tree/rock radius
        // (still allow steps that increase distance, so you can't get stuck).
        if (!blocked) {
          for (const b of blockers) {
            const newDist = angularDistanceToPole(candidate, b.unit) * PLANET_RADIUS
            if (newDist < b.radius) {
              const oldDist = angularDistanceToPole(quat.current, b.unit) * PLANET_RADIUS
              if (newDist < oldDist) {
                blocked = true
                break
              }
            }
          }
        }

        if (!blocked) {
          quat.current.copy(candidate)
          movedAccum.current += angle
          if (!store.hasMoved && movedAccum.current * PLANET_RADIUS > 1.5) store.markMoved()
        }

        // Face the direction of travel (smoothed shortest-arc turn).
        const targetYaw = Math.atan2(moveDir.x, moveDir.z)
        let d = targetYaw - yaw.current
        d = Math.atan2(Math.sin(d), Math.cos(d))
        yaw.current += d * Math.min(1, dt * 12)
      }
    }

    planet.quaternion.copy(quat.current)
    planet.updateMatrixWorld()

    // ---- proximity triggers (angular distance in planet space) ---------
    let nearest: string | null = null
    let nearestArc = INTERACT_ARC_M
    for (const it of interactableUnits) {
      const arc = angularDistanceToPole(quat.current, it.unit) * PLANET_RADIUS
      if (arc <= nearestArc) {
        nearest = it.id
        nearestArc = arc
      }
    }
    if (nearest !== store.nearbyId) store.setNearby(nearest)

    // ---- cosmetic jump + terrain height via raycast ---------------------
    if (keys.jump && jumpT.current === null && !store.openModalId) jumpT.current = 0
    let jumpOffset = 0
    if (jumpT.current !== null) {
      jumpT.current += dt
      jumpOffset = JUMP_V0 * jumpT.current - 0.5 * JUMP_G * jumpT.current ** 2
      if (jumpOffset <= 0) {
        jumpOffset = 0
        jumpT.current = null
      }
    }

    rayOrigin.set(0, PLANET_RADIUS + 30, 0)
    raycaster.set(rayOrigin, RAY_DOWN)
    const meshes = collisionRefs.current.filter((m): m is THREE.Mesh => m !== null)
    const hit = raycaster.intersectObjects(meshes, false)[0]
    const groundY = hit ? hit.point.y : PLANET_RADIUS

    avatar.position.y = groundY + jumpOffset
    avatar.rotation.y = yaw.current
  })
}
