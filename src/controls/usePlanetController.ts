import { useKeyboardControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { interactables } from '../content/interactables'
import {
  blockers,
  INTERACT_ARC_M,
  INTERACT_EXIT_ARC_M,
  MAX_POLAR_RAD,
  MOVE_SPEED,
  PLANET_RADIUS,
  SPRINT_JOY_THRESHOLD,
  SPRINT_SPEED,
} from '../scene/planetConfig'
import { useStore } from '../store/useStore'
import {
  applyStep,
  cameraRelativeMoveDir,
  latLongToUnit,
  poleInPlanetSpace,
  rotationStep,
} from './planetMath'
import { groundHeightAt } from './terrain'

/**
 * Mutable per-frame state shared between the control hooks without causing
 * React renders. The camera hook writes `azimuth` (initial π: the spawn view
 * faces long 0 — sun over the water and the dock); TouchJoystick writes the
 * joystick vector; the controller stamps `wadeRippleTime` when the avatar
 * crosses the waterline so the ripple effect can react.
 */
export const controlsRuntime = {
  joyX: 0,
  joyY: 0,
  azimuth: Math.PI,
  /** Set to snap the camera heading next frame (consumed once) — used by the
   * e2e suites and, later, the intro swoop. */
  azimuthOverride: null as number | null,
  /** Teleport: put this lat/long under the avatar next frame (consumed once). */
  poseOverride: null as { lat: number; long: number } | null,
  wadeRippleTime: 0,
}

const JUMP_V0 = 4.5
const JUMP_G = 12
const MAX_DT = 0.05
const SEA_LEVEL = PLANET_RADIUS

interface ControllerRefs {
  planetRef: React.RefObject<THREE.Group | null>
  avatarRef: React.RefObject<THREE.Group | null>
}

/**
 * The planet controller. The avatar is kinematic at the world pole; input
 * rotates the planet group's quaternion. See planetMath.ts for the math and
 * terrain.ts for the analytic ground.
 */
export function usePlanetController({ planetRef, avatarRef }: ControllerRefs) {
  const [, getKeys] = useKeyboardControls()

  const quat = useRef(new THREE.Quaternion())
  const movedAccum = useRef(0)
  const jumpT = useRef<number | null>(null) // seconds since jump start, null = grounded
  const yaw = useRef(0)
  const targetYaw = useRef(0)
  const lastGroundY = useRef(PLANET_RADIUS)

  const interactableUnits = useMemo(
    () =>
      interactables.map((def) => ({
        id: def.id,
        unit: new THREE.Vector3(...def.position).normalize(),
      })),
    [],
  )
  // The placeholder cubes themselves block movement (walking straight at one
  // must not pass it through the avatar). Radius < trigger arc, so prompts
  // still fire before the wall.
  const allBlockers = useMemo(
    () => [
      ...blockers,
      ...interactableUnits.map((it) => ({ unit: it.unit, radius: 1.2 })),
    ],
    [interactableUnits],
  )

  useFrame((state, rawDt) => {
    const planet = planetRef.current
    const avatar = avatarRef.current
    if (!planet || !avatar) return
    const dt = Math.min(rawDt, MAX_DT)
    const store = useStore.getState()

    if (controlsRuntime.poseOverride) {
      const { lat, long } = controlsRuntime.poseOverride
      controlsRuntime.poseOverride = null
      // q·unit = up puts (lat, long) under the avatar.
      quat.current.setFromUnitVectors(latLongToUnit(lat, long), new THREE.Vector3(0, 1, 0))
    }

    // ---- input --------------------------------------------------------
    const keys = getKeys()
    let ix = (keys.rightward ? 1 : 0) - (keys.leftward ? 1 : 0)
    let iz = (keys.forward ? 1 : 0) - (keys.backward ? 1 : 0)
    let sprinting = Boolean(keys.run)
    if (controlsRuntime.joyX !== 0 || controlsRuntime.joyY !== 0) {
      ix = controlsRuntime.joyX
      iz = controlsRuntime.joyY
      // Full joystick deflection sprints — phones have no Shift key.
      sprinting = Math.hypot(ix, iz) >= SPRINT_JOY_THRESHOLD
    }
    const inputActive = (ix !== 0 || iz !== 0) && !store.openModalId
    const speed = sprinting ? SPRINT_SPEED : MOVE_SPEED

    const poleBefore = poleInPlanetSpace(quat.current)
    const polarBefore = Math.acos(THREE.MathUtils.clamp(poleBefore.y, -1, 1))

    const stepAllowed = (candidatePole: THREE.Vector3): boolean => {
      const newPolar = Math.acos(THREE.MathUtils.clamp(candidatePole.y, -1, 1))
      // Island bounds: cancel steps that leave the cap (allow walking back in).
      if (newPolar > MAX_POLAR_RAD && newPolar > polarBefore) return false
      // Prop blockers: cancel steps that push inward on a tree/rock/cube
      // (steps that increase distance stay allowed, so you can't get stuck).
      for (const b of allBlockers) {
        const newDist = candidatePole.angleTo(b.unit) * PLANET_RADIUS
        if (newDist < b.radius && newDist < poleBefore.angleTo(b.unit) * PLANET_RADIUS) {
          return false
        }
      }
      return true
    }

    const tryMove = (mx: number, mz: number): boolean => {
      const moveDir = cameraRelativeMoveDir(mx, mz, controlsRuntime.azimuth)
      if (moveDir.lengthSq() === 0) return false
      const inputMag = Math.min(1, Math.hypot(mx, mz))
      const angle = (speed * inputMag * dt) / PLANET_RADIUS
      const candidate = applyStep(quat.current, rotationStep(moveDir, angle))
      if (!stepAllowed(poleInPlanetSpace(candidate))) return false
      quat.current.copy(candidate)
      movedAccum.current += angle
      if (!store.hasMoved && movedAccum.current * PLANET_RADIUS > 1.5) store.markMoved()
      targetYaw.current = Math.atan2(moveDir.x, moveDir.z)
      return true
    }

    if (inputActive) {
      // Full step first; if a boundary cancels it, slide along the camera
      // axes so diagonals against a wall don't freeze the avatar.
      if (!tryMove(ix, iz) && (ix === 0 || !tryMove(ix, 0)) && iz !== 0) {
        tryMove(0, iz)
      }
      // Face the direction of travel (frame-rate-independent smoothing).
      let d = targetYaw.current - yaw.current
      d = Math.atan2(Math.sin(d), Math.cos(d))
      yaw.current += d * (1 - Math.exp(-12 * dt))
    }

    planet.quaternion.copy(quat.current)
    planet.updateMatrixWorld()

    // ---- proximity triggers with hysteresis ----------------------------
    const poleAfter = poleInPlanetSpace(quat.current)
    let nearest: string | null = null
    let nearestArc = INTERACT_ARC_M
    for (const it of interactableUnits) {
      const arc = poleAfter.angleTo(it.unit) * PLANET_RADIUS
      if (arc <= nearestArc) {
        nearest = it.id
        nearestArc = arc
      }
    }
    if (nearest === null && store.nearbyId) {
      // Nothing inside the enter radius: keep the current one until it
      // passes the exit radius so the prompt doesn't flicker at the edge.
      const current = interactableUnits.find((it) => it.id === store.nearbyId)
      if (current && poleAfter.angleTo(current.unit) * PLANET_RADIUS <= INTERACT_EXIT_ARC_M) {
        nearest = store.nearbyId
      }
    }
    if (nearest !== store.nearbyId) store.setNearby(nearest)

    // ---- cosmetic jump + analytic terrain height -----------------------
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

    const groundY = groundHeightAt(poleAfter)
    // Any transition to or from sea level is a waterline crossing (wading in
    // from the sand, back out, or stepping off the dock end) → ripple.
    if ((groundY === SEA_LEVEL) !== (lastGroundY.current === SEA_LEVEL)) {
      controlsRuntime.wadeRippleTime = state.clock.elapsedTime
    }
    lastGroundY.current = groundY

    avatar.position.y = groundY + jumpOffset
    avatar.rotation.y = yaw.current
  })
}
