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
  surfOffset,
} from '../scene/planetConfig'
import { useStore } from '../store/useStore'
import {
  applyStep,
  cameraRelativeMoveDir,
  latLongToUnit,
  poleInPlanetSpace,
  rotationStep,
  WORLD_UP,
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
  /** Written every frame for the animated avatar's clip selection. */
  locomotion: 'idle' as 'idle' | 'walk' | 'run',
  airborne: false,
  /** Body world yaw + camera pitch, published for the head look-at (v3.3). */
  avatarYaw: 0,
  camPitch: 0.35,
  /** Camera distance override (meters); null = default follow distance. */
  camDist: null as number | null,
  /** Set to snap the camera pitch next frame (consumed once) — e2e/sweep. */
  pitchOverride: null as number | null,
  /** The live planet orientation, published per frame for the camera's
   * ground-floor clamp (read-only elsewhere). */
  planetQuaternion: new THREE.Quaternion(),
}

const JUMP_V0 = 4.5
const JUMP_G = 12
const MAX_DT = 0.05
const SEA_LEVEL = PLANET_RADIUS

// Frame-loop scratch — the controller allocates nothing per frame.
const _poleBefore = new THREE.Vector3()
const _poleCand = new THREE.Vector3()
const _poleAfter = new THREE.Vector3()
const _moveDir = new THREE.Vector3()
const _stepQ = new THREE.Quaternion()
const _candQ = new THREE.Quaternion()
const _teleportUnit = new THREE.Vector3()

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
  // Wet/dry state against the LIVE waterline (sea level + surf). Spawn is
  // dry; initializing wet would fire a phantom ripple on the first frame.
  const lastWet = useRef(false)

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
      ...interactableUnits.map((it, i) => ({
        unit: it.unit,
        radius: interactables[i].blockRadius ?? 1.2,
      })),
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
      // q·unit = up puts (lat, long) under the avatar (teleports aren't hot).
      quat.current.setFromUnitVectors(_teleportUnit.copy(latLongToUnit(lat, long)), WORLD_UP)
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
    const inputActive = (ix !== 0 || iz !== 0) && !store.openModalId && store.introDone
    const speed = sprinting ? SPRINT_SPEED : MOVE_SPEED

    poleInPlanetSpace(quat.current, _poleBefore)
    const polarBefore = Math.acos(THREE.MathUtils.clamp(_poleBefore.y, -1, 1))

    if (inputActive) {
      // Full step first; if a boundary cancels it, slide along the camera
      // axes so diagonals against a wall don't freeze the avatar.
      // k=0: (ix,iz), k=1: (ix,0), k=2: (0,iz) — no closures, no arrays.
      for (let k = 0; k < 3; k++) {
        const mx = k === 2 ? 0 : ix
        const mz = k === 1 ? 0 : iz
        if (mx === 0 && mz === 0) continue
        cameraRelativeMoveDir(mx, mz, controlsRuntime.azimuth, _moveDir)
        if (_moveDir.lengthSq() === 0) continue
        const inputMag = Math.min(1, Math.hypot(mx, mz))
        const angle = (speed * inputMag * dt) / PLANET_RADIUS
        rotationStep(_moveDir, angle, _stepQ)
        applyStep(quat.current, _stepQ, _candQ)
        poleInPlanetSpace(_candQ, _poleCand)

        // Island bounds: cancel steps that leave the cap (allow walking back in).
        const newPolar = Math.acos(THREE.MathUtils.clamp(_poleCand.y, -1, 1))
        let blocked = newPolar > MAX_POLAR_RAD && newPolar > polarBefore
        // Prop blockers: cancel steps that push inward on a tree/rock/cube
        // (steps that increase distance stay allowed, so you can't get stuck).
        if (!blocked) {
          for (const b of allBlockers) {
            const newDist = _poleCand.angleTo(b.unit) * PLANET_RADIUS
            if (newDist < b.radius && newDist < _poleBefore.angleTo(b.unit) * PLANET_RADIUS) {
              blocked = true
              break
            }
          }
        }
        if (blocked) continue

        quat.current.copy(_candQ)
        movedAccum.current += angle
        if (!store.hasMoved && movedAccum.current * PLANET_RADIUS > 1.5) store.markMoved()
        targetYaw.current = Math.atan2(_moveDir.x, _moveDir.z)
        break
      }
      // Face the direction of travel (frame-rate-independent smoothing).
      let d = targetYaw.current - yaw.current
      d = Math.atan2(Math.sin(d), Math.cos(d))
      yaw.current += d * (1 - Math.exp(-12 * dt))
    }

    planet.quaternion.copy(quat.current)
    planet.updateMatrixWorld()
    controlsRuntime.planetQuaternion.copy(quat.current)

    // ---- proximity triggers with hysteresis ----------------------------
    poleInPlanetSpace(quat.current, _poleAfter)
    let nearest: string | null = null
    let nearestArc = INTERACT_ARC_M
    for (const it of interactableUnits) {
      const arc = _poleAfter.angleTo(it.unit) * PLANET_RADIUS
      if (arc <= nearestArc) {
        nearest = it.id
        nearestArc = arc
      }
    }
    if (nearest === null && store.nearbyId) {
      // Nothing inside the enter radius: keep the current one until it
      // passes the exit radius so the prompt doesn't flicker at the edge.
      const current = interactableUnits.find((it) => it.id === store.nearbyId)
      if (current && _poleAfter.angleTo(current.unit) * PLANET_RADIUS <= INTERACT_EXIT_ARC_M) {
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

    const groundY = groundHeightAt(_poleAfter)
    // Wet/dry transition against the LIVE waterline (sea level + surf —
    // the same surfOffset the water shader displaces by, v3.3): wading in
    // down the slope, back out, stepping off the dock end, or the surf
    // washing over your feet while you stand at the edge → ripple.
    // Suppressed mid-jump: feet aren't in the water.
    const polarAfter = Math.acos(THREE.MathUtils.clamp(_poleAfter.y, -1, 1))
    const wet = groundY < SEA_LEVEL + surfOffset(polarAfter, state.clock.elapsedTime)
    if (jumpT.current === null && wet !== lastWet.current) {
      controlsRuntime.wadeRippleTime = state.clock.elapsedTime
    }
    lastWet.current = wet

    avatar.position.y = groundY + jumpOffset
    avatar.rotation.y = yaw.current
    controlsRuntime.avatarYaw = yaw.current
    controlsRuntime.locomotion = !inputActive ? 'idle' : sprinting ? 'run' : 'walk'
    controlsRuntime.airborne = jumpT.current !== null
  })
}
