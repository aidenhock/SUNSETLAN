import { useKeyboardControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useLiveInteractables } from '../content/liveInteractables'
import { usePlacementRuntime } from '../scene/placementRuntime'
import { jumpTaps } from '../audio/footsteps'
import { play2d } from '../audio/core'
import {
  advanceBoat,
  boatStepBlocked,
  BOAT_BLOCKERS,
  DOCK_END_UNITS,
  DOCK_NAMES,
  MOORING_UNITS,
  type BoatInput,
  type BoatMotion,
  type DockName,
} from '../scene/boat'
import {
  blockers,
  BOAT,
  INTERACT_ARC_M,
  INTERACT_EXIT_ARC_M,
  MOVE_SPEED,
  PLANET_RADIUS,
  SPRINT_JOY_THRESHOLD,
  SPRINT_SPEED,
  stepLeavesLandmass,
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
   * pose blend and the e2e suite read this. Boating counts: the seated
   * pose is the one that fits a bench. */
  seated: false,
  /** True from stepping aboard through the landing tween that parks the
   * boat back at a mooring — the window where the player rides the hull
   * instead of the ground. The renderer hands the boat between its
   * moored mesh and its pole-fixed one on this flag. */
  boating: false,
  /** World yaw of the bow, metres per second along it, and the live
   * vertical bob / roll / pitch of the deck (metres, radians). */
  boatHeading: 0,
  boatSpeed: 0,
  boatBob: 0,
  boatRoll: 0,
  boatPitch: 0,
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
/** The boat's bench top above its waterline (props.ts buildBoat), minus
 * the same drop the log seat uses (log top 0.42, root raise 0.30): the
 * rig's root is at its FEET, so parking it ON the bench floats the hips
 * a head above the thwart. */
const BOAT_SEAT_M = 0.38 - 0.12

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
const _boatDir = new THREE.Vector3()
const _boatInput: BoatInput = { dirYaw: null, mag: 0 }

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
  // The boat. `boatPhase` mirrors the store so state changes are edges;
  // `boatTween` is the sit tween's twin, and `landingLeg` says whether
  // the tie-up is still carrying the boat to its mooring (leg 1) or the
  // player across onto the deck (leg 2).
  const boatPhase = useRef<'moored' | 'boarding' | 'driving' | 'landing'>('moored')
  const boatTween = useRef<{ t: number; from: THREE.Quaternion; to: THREE.Quaternion } | null>(null)
  const boatTweenQs = useRef({ from: new THREE.Quaternion(), to: new THREE.Quaternion() })
  const landingLeg = useRef<1 | 2>(1)
  const boatMotion = useRef<BoatMotion>({ heading: 0, speed: 0 })
  const lastBoatSpeed = useRef(0)
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
    // ---- the boat ------------------------------------------------------
    // Boarding and tying up use the SAME construction as the sit tween: a
    // quaternion delta (world mooring direction → pole) premultiplied onto
    // the live orientation and slerped over BOAT.tweenS. A tween, never a
    // step, so blockers don't apply — which is the only way the mooring,
    // parked 1.7 m off the dock inside its own blocker, is reachable.
    const boat = store.boat
    if (boat.state !== boatPhase.current) {
      if (boat.state === 'boarding' || boat.state === 'landing') {
        _seatWorldDir.copy(MOORING_UNITS[boat.at]).applyQuaternion(quat.current)
        _sitDelta.setFromUnitVectors(_seatWorldDir, WORLD_UP)
        const qs = boatTweenQs.current
        qs.from.copy(quat.current)
        qs.to.multiplyQuaternions(_sitDelta, quat.current).normalize()
        boatTween.current = { t: 0, from: qs.from, to: qs.to }
        landingLeg.current = 1
        if (boat.state === 'boarding') {
          // Start pointing the way the moored bow points — AWAY from the
          // land — in the world frame the tween will leave us in. Starting
          // on the avatar's yaw could aim straight into the pier's
          // blocker, and a blocked step zeroes the throttle: stuck.
          _boatDir
            .copy(WORLD_UP)
            .addScaledVector(MOORING_UNITS[boat.at], -MOORING_UNITS[boat.at].y)
            .normalize()
          if (boat.at === 'north') _boatDir.negate()
          _boatDir.applyQuaternion(qs.to)
          boatMotion.current.heading = Math.atan2(_boatDir.x, _boatDir.z)
          boatMotion.current.speed = 0
        }
        void play2d('splash', 'world', 0.45)
      }
      boatPhase.current = boat.state
    }
    if (boatTween.current) {
      const tw = boatTween.current
      tw.t += dt / BOAT.tweenS
      quat.current.slerpQuaternions(
        tw.from,
        tw.to,
        THREE.MathUtils.smoothstep(Math.min(tw.t, 1), 0, 1),
      )
      if (tw.t >= 1) {
        quat.current.copy(tw.to)
        boatTween.current = null
        if (boat.state === 'boarding') {
          store.setBoatState('driving')
          boatPhase.current = 'driving'
        } else if (boat.state === 'landing' && landingLeg.current === 1) {
          // Leg 2: the boat now sits exactly at its mooring, so the same
          // tween can carry the player the last step onto the deck.
          landingLeg.current = 2
          _seatWorldDir.copy(DOCK_END_UNITS[boat.at]).applyQuaternion(quat.current)
          _sitDelta.setFromUnitVectors(_seatWorldDir, WORLD_UP)
          const qs = boatTweenQs.current
          qs.from.copy(quat.current)
          qs.to.multiplyQuaternions(_sitDelta, quat.current).normalize()
          boatTween.current = { t: 0, from: qs.from, to: qs.to }
          void play2d('splash', 'world', 0.45)
        } else if (boat.state === 'landing') {
          store.setBoatState('moored')
          boatPhase.current = 'moored'
          boatMotion.current.speed = 0
        }
      }
    }
    const phase = boatPhase.current
    // The hull is under the player from boarding until the landing tween
    // has put the boat back on its mooring; leg 2 is already a walk.
    const boating =
      phase === 'boarding' || phase === 'driving' || (phase === 'landing' && landingLeg.current === 1)
    controlsRuntime.seated = sitting || boating

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
    const controllable =
      !controlsRuntime.suppressInput && !store.openModalId && store.introDone
    const steering = (ix !== 0 || iz !== 0) && controllable
    const inputActive = steering && !sitting && !sitTween.current && !boating
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

        // Landmass bounds: cancel steps that leave whichever cap you are
        // standing on — the island in the north, Antarctica in the south
        // (allow walking back in). The predicate is pure in planetConfig.
        const newPolar = Math.acos(THREE.MathUtils.clamp(_poleCand.y, -1, 1))
        let blocked = stepLeavesLandmass(polarBefore, newPolar)
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

    // Driving: the same rotationStep/applyStep as walking, but stepped
    // along the BOAT's heading rather than the raw input — so the hull
    // carries its momentum through a turn instead of sliding sideways.
    // The landmass clamp gives way to the boat's shore clamp, and the
    // blocker list shrinks to the two docks (you can't drive through a
    // pier; everything on land is unreachable anyway).
    if (phase === 'driving' && !boatTween.current) {
      const m = boatMotion.current
      _boatInput.dirYaw = null
      _boatInput.mag = 0
      if (steering) {
        cameraRelativeMoveDir(ix, iz, controlsRuntime.azimuth, _moveDir)
        if (_moveDir.lengthSq() > 0) {
          _boatInput.dirYaw = Math.atan2(_moveDir.x, _moveDir.z)
          _boatInput.mag = Math.min(1, Math.hypot(ix, iz))
        }
      }
      const arc = advanceBoat(m, _boatInput, dt, BOAT)
      if (arc > 0) {
        _boatDir.set(Math.sin(m.heading), 0, Math.cos(m.heading))
        rotationStep(_boatDir, arc, _stepQ)
        applyStep(quat.current, _stepQ, _candQ)
        poleInPlanetSpace(_candQ, _poleCand)
        const newPolar = Math.acos(THREE.MathUtils.clamp(_poleCand.y, -1, 1))
        let blocked = boatStepBlocked(polarBefore, newPolar)
        if (!blocked) {
          for (const b of BOAT_BLOCKERS) {
            const newDist = _poleCand.angleTo(b.unit) * PLANET_RADIUS
            if (newDist < b.radius && newDist < _poleBefore.angleTo(b.unit) * PLANET_RADIUS) {
              blocked = true
              break
            }
          }
        }
        if (blocked) {
          m.speed = 0
        } else {
          quat.current.copy(_candQ)
          movedAccum.current += arc
          if (!store.hasMoved && movedAccum.current * PLANET_RADIUS > 1.5) store.markMoved()
        }
      }
      targetYaw.current = m.heading
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
    // Out on the water nothing on land is within reach, and the tripod on
    // the dock end would otherwise fight the boat for E — while boating
    // every land prompt is simply off.
    let nearest: string | null = null
    // Arc to the chosen interactable (∞ when none) — the boat prompt only
    // takes E when the boat is NEARER than it, so the Photos tripod on the
    // dock end stays reachable beside the mooring.
    let nearestArc = Infinity
    if (!boating) {
      nearestArc = INTERACT_ARC_M
      for (const it of interactableUnits) {
        const arc = _poleAfter.angleTo(it.unit) * PLANET_RADIUS
        if (arc <= nearestArc) {
          nearest = it.id
          nearestArc = arc
        }
      }
      if (nearest === null) {
        nearestArc = Infinity
        if (store.nearbyId) {
          // Nothing inside the enter radius: keep the current one until it
          // passes the exit radius so the prompt doesn't flicker at the edge.
          const current = interactableUnits.find((it) => it.id === store.nearbyId)
          if (current) {
            const arc = _poleAfter.angleTo(current.unit) * PLANET_RADIUS
            if (arc <= INTERACT_EXIT_ARC_M) {
              nearest = store.nearbyId
              nearestArc = arc
            }
          }
        }
      }
    }
    if (nearest !== store.nearbyId) store.setNearby(nearest)

    // Sit-prompt proximity (same hysteresis pattern). Hidden while seated
    // or tweening; the Hud gives interactable prompts priority on E.
    let nearLog: number | null = null
    if (!sitting && !sitTween.current && !boating) {
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

    // Boat prompts, same hysteresis: on foot beside the mooring you can
    // board; driving, the dock whose far end is within reach is the one
    // you can tie up to.
    let nearBoat = false
    if (phase === 'moored' && !boatTween.current && !sitting && !sitTween.current) {
      const arc = _poleAfter.angleTo(MOORING_UNITS[boat.at]) * PLANET_RADIUS
      nearBoat = arc <= (store.nearbyBoat ? BOAT.boardExitArcM : BOAT.boardArcM) && arc < nearestArc
    }
    if (nearBoat !== store.nearbyBoat) store.setNearbyBoat(nearBoat)

    let nearDock: DockName | null = null
    if (phase === 'driving') {
      for (const name of DOCK_NAMES) {
        if (_poleAfter.angleTo(DOCK_END_UNITS[name]) * PLANET_RADIUS <= BOAT.dockArcM) {
          nearDock = name
          break
        }
      }
    }
    if (nearDock !== store.nearbyDockFromBoat) store.setNearbyDockFromBoat(nearDock)

    // ---- cosmetic jump + analytic terrain height -----------------------
    // 3C: takeoff/landing fire Aiden's double-tap from the surface pool
    // (never a single heavy thud).
    // Jump is off in the boat: there is nothing to jump off onto.
    const jumpPressed = Boolean(keys.jump) && !boating
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

    const polarAfter = Math.acos(THREE.MathUtils.clamp(_poleAfter.y, -1, 1))
    const now = state.clock.elapsedTime

    // The deck's own motion: a quick hull bob over the LIVE surf, so the
    // boat breathes with the same water the shader displaces. Roll and
    // pitch are two slow sines; pitch also dips as the boat accelerates.
    let boatBob = 0
    if (boating) {
      const m = boatMotion.current
      boatBob = 0.05 * Math.sin(now * 4.4) + surfOffset(polarAfter, now)
      const accel = dt > 0 ? (m.speed - lastBoatSpeed.current) / dt : 0
      lastBoatSpeed.current = m.speed
      controlsRuntime.boatHeading = m.heading
      controlsRuntime.boatSpeed = m.speed
      controlsRuntime.boatBob = boatBob
      controlsRuntime.boatRoll = 0.03 * Math.sin(now * 0.83)
      controlsRuntime.boatPitch = 0.03 * Math.sin(now * 0.61 + 1.3) - accel * 0.02
    } else {
      lastBoatSpeed.current = 0
      controlsRuntime.boatSpeed = 0
    }
    controlsRuntime.boating = boating

    // Afloat, the "ground" IS the deck's waterline — the blob shadow rides
    // it and the camera floor (usePointerLockCamera) clamps to it.
    const groundY = boating ? SEA_LEVEL + boatBob : groundHeightAt(_poleAfter)
    // Wet/dry transition against the LIVE waterline (sea level + surf —
    // the same surfOffset the water shader displaces by, v3.3): wading in
    // down the slope, back out, stepping off the dock end, or the surf
    // washing over your feet while you stand at the edge → ripple.
    // Suppressed mid-jump (feet aren't in the water) and afloat (dry feet).
    const wet = !boating && groundY < SEA_LEVEL + surfOffset(polarAfter, now)
    if (jumpT.current === null && wet !== lastWet.current) {
      controlsRuntime.wadeRippleTime = state.clock.elapsedTime
    }
    lastWet.current = wet

    // Seat lift eases in alongside the sit tween: the root raise that puts
    // the seated hips on the log top (~0.42 m after sink; stubby legs).
    seatLift.current += ((sitting ? SEAT_RAISE_M : 0) - seatLift.current) * (1 - Math.exp(-dt / 0.15))
    avatar.position.y = boating
      ? groundY + BOAT_SEAT_M
      : groundY + jumpOffset + seatLift.current
    avatar.rotation.y = yaw.current
    controlsRuntime.avatarYaw = yaw.current
    controlsRuntime.groundY = groundY
    controlsRuntime.jumpOffset = boating ? 0 : jumpOffset
    controlsRuntime.locomotion = boating || !inputActive ? 'idle' : sprinting ? 'run' : 'walk'
    controlsRuntime.airborne = !boating && jumpT.current !== null
    // 3C: the band underfoot, published for footstep surface switching.
    controlsRuntime.surfPolarDeg = THREE.MathUtils.radToDeg(polarAfter)
    controlsRuntime.surfLongDeg = THREE.MathUtils.radToDeg(
      Math.atan2(_poleAfter.x, _poleAfter.z),
    )
    controlsRuntime.wet = wet
  })
}
