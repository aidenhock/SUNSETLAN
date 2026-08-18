import { useKeyboardControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useLiveInteractables } from '../content/liveInteractables'
import { usePlacementRuntime } from '../scene/placementRuntime'
import { jumpTaps } from '../audio/footsteps'
import {
  blockers,
  INTERACT_ARC_M,
  INTERACT_EXIT_ARC_M,
  MAX_POLAR_RAD,
  MOVE_SPEED,
  PLANET_RADIUS,
  SPRINT_JOY_THRESHOLD,
  SPRINT_SPEED,
  surfaceUnderfoot,
  surfOffset,
} from '../scene/planetConfig'
import { FIRE_UNIT, LOG_UNITS, seatUnit, standUnit, type SeatSpot } from '../scene/seats'
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
  /** Ground height and jump altitude published separately (v3.4): the blob
   * shadow takes groundY ONLY — it must never ride the jump. */
  groundY: 55.55,
  jumpOffset: 0,
  /** 3C: analytic band underfoot for footstep surface switching. */
  surfPolarDeg: 0,
  surfLongDeg: 0,
  wet: false,
  /** Camera distance override (meters); null = default follow distance. */
  camDist: null as number | null,
  /** Set to snap the camera pitch next frame (consumed once) — e2e/sweep. */
  pitchOverride: null as number | null,
  /** The live planet orientation, published per frame for the camera's
   * ground-floor clamp (read-only elsewhere). */
  planetQuaternion: new THREE.Quaternion(),
  /** True while seated at the fire (or tweening onto a seat) — the avatar
   * pose blend and the e2e suite read this. */
  seated: false,
  /** Set by the dev world editor while a placement is selected: the
   * arrow keys nudge the prop instead of walking the player. */
  suppressInput: false,
  /** True while the dev world editor is open: clicks select props
   * instead of opening their modals. */
  editing: false,
}

const JUMP_V0 = 4.5
const JUMP_G = 12
const MAX_DT = 0.05
const SEA_LEVEL = PLANET_RADIUS

// Sit system (3C): prompt hysteresis around a log, the eased world tween
// that carries the chosen seat under the pole, and the root raise that
// parks the avatar's seat on the log top (log top ≈ 0.42 m after sink).
const SIT_ARC_M = 2.2
const SIT_EXIT_ARC_M = 2.7
const SIT_TWEEN_S = 0.4
const SEAT_RAISE_M = 0.3

// Frame-loop scratch — the controller allocates nothing per frame.
const _poleBefore = new THREE.Vector3()
const _poleCand = new THREE.Vector3()
const _poleAfter = new THREE.Vector3()
const _moveDir = new THREE.Vector3()
const _stepQ = new THREE.Quaternion()
const _candQ = new THREE.Quaternion()
const _teleportUnit = new THREE.Vector3()
const _seatWorldDir = new THREE.Vector3()
const _fireWorld = new THREE.Vector3()
const _sitDelta = new THREE.Quaternion()

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
  // Sit system: the store's seatedSeat is the source of truth; the
  // controller mirrors it to detect sit/stand edges and runs the world
  // tween + seat lift. lastJump edge-detects the stand-up jump press.
  const seatedId = useRef<SeatSpot | null>(null)
  const sitTween = useRef<{ t: number; from: THREE.Quaternion; to: THREE.Quaternion } | null>(null)
  const sitTweenQs = useRef({ from: new THREE.Quaternion(), to: new THREE.Quaternion() })
  const seatLift = useRef(0)
  const lastJump = useRef(false)
  // Wet/dry state against the LIVE waterline (sea level + surf). Spawn is
  // dry; initializing wet would fire a phantom ripple on the first frame.
  const lastWet = useRef(false)

  // Placements can move under us in the dev editor, and the trigger
  // points and blockers have to move WITH them — on the drop, not on a
  // reload. `version` bumps on every edit; in production it never does.
  const version = usePlacementRuntime((s) => s.version)
  const interactables = useLiveInteractables()
  const interactableUnits = useMemo(
    () =>
      interactables.map((def) => ({
        id: def.id,
        unit: new THREE.Vector3(...def.position).normalize(),
      })),
    [interactables],
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
    // `blockers` is rebuilt in place by the placement store, so the
    // version is what tells us this snapshot went stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [interactableUnits, version],
  )

  useFrame((state, rawDt) => {
    const planet = planetRef.current
    const avatar = avatarRef.current
    if (!planet || !avatar) return
    const dt = Math.min(rawDt, MAX_DT)
    const store = useStore.getState()
    // Inside the room a different controller owns the avatar and the
    // camera's runtime values; the planet just holds its last pose.
    if (store.inRoom) return

    if (controlsRuntime.poseOverride) {
      const { lat, long } = controlsRuntime.poseOverride
      controlsRuntime.poseOverride = null
      // q·unit = up puts (lat, long) under the avatar (teleports aren't hot).
      quat.current.setFromUnitVectors(_teleportUnit.copy(latLongToUnit(lat, long)), WORLD_UP)
    }

    // ---- sit system (3C) ----------------------------------------------
    // Sit/stand edges from the store. Both start a short eased world tween:
    // a quaternion DELTA (setFromUnitVectors world-seat-dir → pole) composed
    // onto the live orientation — never a step, so blockers don't apply and
    // the world glides the seat (or the stand-up spot in front of it, fire
    // side) under the avatar.
    const storeSeat = store.seatedSeat
    if (storeSeat !== seatedId.current) {
      const seat = storeSeat ?? seatedId.current
      if (seat) {
        // seatUnit/standUnit allocate — sit/stand are events, not frames.
        const dest = storeSeat ? seatUnit(seat) : standUnit(seat)
        _seatWorldDir.copy(dest).applyQuaternion(quat.current)
        _sitDelta.setFromUnitVectors(_seatWorldDir, WORLD_UP)
        const qs = sitTweenQs.current
        qs.from.copy(quat.current)
        qs.to.multiplyQuaternions(_sitDelta, quat.current).normalize()
        sitTween.current = { t: 0, from: qs.from, to: qs.to }
        if (storeSeat) {
          // Turn to face the fire where it will be once the tween lands.
          _fireWorld.copy(FIRE_UNIT).applyQuaternion(qs.to)
          targetYaw.current = Math.atan2(_fireWorld.x, _fireWorld.z)
        }
      }
      seatedId.current = storeSeat
    }
    const sitting = seatedId.current !== null
    if (sitTween.current) {
      const tw = sitTween.current
      tw.t += dt / SIT_TWEEN_S
      const s = THREE.MathUtils.smoothstep(Math.min(tw.t, 1), 0, 1)
      quat.current.slerpQuaternions(tw.from, tw.to, s)
      if (tw.t >= 1) {
        quat.current.copy(tw.to)
        sitTween.current = null
      }
    }
    controlsRuntime.seated = sitting

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
    const inputActive =
      (ix !== 0 || iz !== 0) &&
      !controlsRuntime.suppressInput &&
      !store.openModalId &&
      store.introDone &&
      !sitting &&
      !sitTween.current
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
    }
    // Face the travel direction — or the fire while sitting down (the
    // easing runs unconditionally; targetYaw only changes on input/sit).
    {
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

    // Sit-prompt proximity (same hysteresis pattern). Hidden while seated
    // or tweening; the Hud gives interactable prompts priority on E.
    let nearLog: number | null = null
    if (!sitting && !sitTween.current) {
      let bestArc = SIT_ARC_M
      for (let i = 0; i < LOG_UNITS.length; i++) {
        const arc = _poleAfter.angleTo(LOG_UNITS[i]) * PLANET_RADIUS
        if (arc <= bestArc) {
          nearLog = i
          bestArc = arc
        }
      }
      if (
        nearLog === null &&
        store.nearbyLog !== null &&
        _poleAfter.angleTo(LOG_UNITS[store.nearbyLog]) * PLANET_RADIUS <= SIT_EXIT_ARC_M
      ) {
        nearLog = store.nearbyLog
      }
    }
    if (nearLog !== store.nearbyLog) store.setNearbyLog(nearLog)

    // ---- cosmetic jump + analytic terrain height -----------------------
    // 3C: takeoff/landing fire Aiden's double-tap from the surface pool
    // (never a single heavy thud).
    const jumpPressed = Boolean(keys.jump)
    if (jumpPressed && !lastJump.current && sitting && !store.openModalId) {
      // Jump is the other stand-up control while seated — no launch.
      store.standUp()
    } else if (
      jumpPressed &&
      jumpT.current === null &&
      !store.openModalId &&
      !sitting &&
      !sitTween.current
    ) {
      jumpT.current = 0
      jumpTaps(
        surfaceUnderfoot(controlsRuntime.surfPolarDeg, controlsRuntime.surfLongDeg, controlsRuntime.wet),
        false,
      )
    }
    lastJump.current = jumpPressed
    let jumpOffset = 0
    if (jumpT.current !== null) {
      jumpT.current += dt
      jumpOffset = JUMP_V0 * jumpT.current - 0.5 * JUMP_G * jumpT.current ** 2
      if (jumpOffset <= 0) {
        jumpOffset = 0
        jumpT.current = null
        jumpTaps(
          surfaceUnderfoot(controlsRuntime.surfPolarDeg, controlsRuntime.surfLongDeg, controlsRuntime.wet),
          true,
        )
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

    // Seat lift eases in alongside the sit tween: the root raise that puts
    // the seated hips on the log top (~0.42 m after sink; stubby legs).
    seatLift.current += ((sitting ? SEAT_RAISE_M : 0) - seatLift.current) * (1 - Math.exp(-dt / 0.15))
    avatar.position.y = groundY + jumpOffset + seatLift.current
    avatar.rotation.y = yaw.current
    controlsRuntime.avatarYaw = yaw.current
    controlsRuntime.groundY = groundY
    controlsRuntime.jumpOffset = jumpOffset
    controlsRuntime.locomotion = !inputActive ? 'idle' : sprinting ? 'run' : 'walk'
    controlsRuntime.airborne = jumpT.current !== null
    // 3C: the band underfoot, published for footstep surface switching.
    controlsRuntime.surfPolarDeg = THREE.MathUtils.radToDeg(polarAfter)
    controlsRuntime.surfLongDeg = THREE.MathUtils.radToDeg(
      Math.atan2(_poleAfter.x, _poleAfter.z),
    )
    controlsRuntime.wet = wet
  })
}
