import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { CharacterConfig } from '../content/characters'
import { tintGeometry } from './geometryUtils'
import { normalizeForMerge } from './props'

/**
 * BlockyCharacter (name kept) — Character 2.0, the ROUNDED AC-villager rig
 * (playbook §1 rounded recipe): flattened-sphere head with solid hair
 * volumes, big oval eyes with highlights, egg torso, capsule limbs with
 * ball hands, lozenge shoes. Each rigid node (torso, head, arm, leg)
 * merges its colored pieces into ONE vertex-colored geometry, so a whole
 * character costs 6 draw calls with a single shared Lambert material.
 *
 * Characters are the deliberate SMOOTH-shading exception (flatShading
 * false): matte-plastic AC/Mii toys on a flat-faceted world. The merge
 * path preserves smooth normals — toNonIndexed() copies the attribute;
 * computeVertexNormals is never called on character parts.
 *
 * Animation is pure transform math on the pivot groups — no skeleton, no
 * AnimationMixer. One parameter set per state (idle/walk/run/air); the live
 * parameters lerp toward the active state's targets (~0.15 s time constant),
 * which IS the crossfade.
 */

export interface MotionState {
  locomotion: 'idle' | 'walk' | 'run'
  airborne: boolean
  /** Camera azimuth around the character (world yaw of the camera dir). */
  azimuth: number
  /** The body's current world yaw (facing). */
  avatarYaw: number
  /** Camera elevation — the head tilts up toward a high camera. */
  camPitch: number
}

interface Params {
  bobAmp: number
  bobFreq: number
  swingAmp: number
  swingFreq: number
  armRatio: number
  lean: number
  sway: number
  /** 1 = airborne pose (tucked legs, raised arms) overrides the swing. */
  air: number
}

// Amplitudes retuned (v3.15) for the rounded volumes: the stubby capsule
// limbs read smaller than the old boxes, so swings and the run lean come
// up ~15–20%; idle breathes a touch deeper on the egg torso.
const STATES: Record<'idle' | 'walk' | 'run' | 'air', Params> = {
  idle: { bobAmp: 0.026, bobFreq: 2, swingAmp: 0, swingFreq: 0, armRatio: 0, lean: 0, sway: 0.07, air: 0 },
  walk: { bobAmp: 0.034, bobFreq: 18, swingAmp: 0.58, swingFreq: 9, armRatio: 0.6, lean: 0.035, sway: 0, air: 0 },
  run: { bobAmp: 0.055, bobFreq: 25, swingAmp: 0.92, swingFreq: 12.5, armRatio: 0.75, lean: 0.16, sway: 0, air: 0 },
  air: { bobAmp: 0, bobFreq: 0, swingAmp: 0, swingFreq: 0, armRatio: 0, lean: 0.05, sway: 0, air: 1 },
}

/** Airborne pose angles (rad) — asymmetric so the jump reads dynamic. */
const AIR_POSE = { legL: -0.45, legR: 0.25, armL: -0.65, armR: -0.5, splay: 0.22 }
/** Head look-at (v3.4): clamps from body forward, blend time constant, the
 * subtle glance allowance while moving, and the frontal-cone handoff — eye
 * contact inside ~±70°, the camera's aim point beyond it. */
const HEAD_YAW_MAX = THREE.MathUtils.degToRad(60)
const HEAD_PITCH_MAX = THREE.MathUtils.degToRad(25)
const HEAD_GLANCE_MAX = THREE.MathUtils.degToRad(10)
const HEAD_CONE_IN = THREE.MathUtils.degToRad(55)
const HEAD_CONE_OUT = THREE.MathUtils.degToRad(85)
const HEAD_TAU = 0.2

const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
/** Squash & stretch scales, roughly volume-preserving (playbook §2). */
const STRETCH = { xz: 0.93, y: 1.14 }
const SQUASH = { xz: 1.09, y: 0.85 }
const LAND_S = 0.18
const BLEND_TAU = 0.15

/** Sphere scaled into an arbitrary ellipsoid — the rounded rig's staple. */
function blob(r: number, ws: number, hs: number, sx: number, sy: number, sz: number) {
  return new THREE.SphereGeometry(r, ws, hs).applyMatrix4(
    new THREE.Matrix4().makeScale(sx, sy, sz),
  )
}

/** Build the four merged node geometries from a config (exported for tests). */
export function buildNodes(config: CharacterConfig) {
  const { height: H, headsTall, build, colors } = config
  const headH = H / headsTall
  const legLen = H * 0.14
  const torsoH = H - headH - legLen
  const headR = headH * 0.51
  const headW = headR * 2
  // Teardrop proportions (v3.16): shoulders ≈0.55× head width sloping out
  // to hips ≈0.78× — the widest point sits near the BASE, never the top.
  const shoulderR = headW * (config.shoulderFrac ?? 0.275) * build
  const hipR = headW * (config.hipFrac ?? 0.39) * build
  const armLen = torsoH * 0.95

  const parts = {
    torso: [] as THREE.BufferGeometry[],
    head: [] as THREE.BufferGeometry[],
    arm: [] as THREE.BufferGeometry[],
    leg: [] as THREE.BufferGeometry[],
  }
  const add = (
    bucket: keyof typeof parts,
    geo: THREE.BufferGeometry,
    color: string,
    pos: [number, number, number],
    rot?: [number, number, number],
  ) => {
    // Normalize BEFORE tinting so the color attribute matches the final
    // vertex count (mixed index-ness makes mergeGeometries return null).
    const g = normalizeForMerge(geo)
    geo.dispose()
    tintGeometry(g, color)
    if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)))
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(...pos))
    parts[bucket].push(g)
  }

  // ---- Torso (local origin at the hips / leg tops) --------------------
  // TEARDROP lathe (v3.16): narrow sloped shoulders widening smoothly to
  // the hips near the base — the inverse of the old egg. Depth squashed
  // slightly so the profile reads chibi, not barrel.
  // Watertight teardrop, BOTTOM→TOP (v3.17 — a top→bottom profile winds
  // the triangles inward and the backface-culled hollow renders
  // arms-through-the-torso from behind). Rounded base → ONE unbroken
  // convex curve to the hip → smooth taper into a domed collar around
  // the neck; both ends on the axis so the lathe caps itself.
  const collarR = headR * 0.36
  const profile: THREE.Vector2[] = [new THREE.Vector2(0, -torsoH * 0.06)]
  for (let i = 1; i <= 3; i++) {
    const a = (i / 3) * Math.PI * 0.5
    profile.push(
      new THREE.Vector2(Math.sin(a) * hipR, torsoH * (-0.06 + (1 - Math.cos(a)) * 0.18)),
    )
  }
  for (let i = 1; i <= 5; i++) {
    const t = i / 5
    profile.push(
      new THREE.Vector2(
        collarR + (hipR - collarR) * Math.cos((t * Math.PI) / 2),
        torsoH * (0.12 + 0.74 * t),
      ),
    )
  }
  profile.push(new THREE.Vector2(collarR * 0.85, torsoH * 0.94))
  profile.push(new THREE.Vector2(collarR * 0.45, torsoH * 0.99))
  profile.push(new THREE.Vector2(0, torsoH))
  add(
    'torso',
    new THREE.LatheGeometry(profile, 14).applyMatrix4(new THREE.Matrix4().makeScale(1, 1, 0.86)),
    colors.top,
    [0, 0, 0],
  )
  if (config.outfit === 'dress') {
    // Flared cone skirt from the hips.
    add('torso', new THREE.ConeGeometry(hipR * 1.35, torsoH * 0.45, 14, 1), colors.bottom, [
      0,
      torsoH * 0.1,
      0,
    ])
  } else {
    // Shorts hip band: a short cylinder hugging the teardrop's widest
    // point — the garment's waist, never a flared bowl. The leg cuffs
    // live in the LEG nodes.
    add(
      'torso',
      new THREE.CylinderGeometry(hipR * 0.99, hipR * 0.8, torsoH * 0.26, 14).applyMatrix4(
        // Match the teardrop's depth squash or the band rim pokes out
        // front/back as a saucer in profile.
        new THREE.Matrix4().makeScale(1, 1, 0.86),
      ),
      colors.bottom,
      // Top edge overlaps the (narrower) skin profile — a waistband lip,
      // never an open bowl rim with a gap behind it.
      [0, torsoH * 0.09, 0],
    )
  }

  // ---- Head (local origin at the neck; face = +z) ---------------------
  // Studio dials: hH/hR scale the whole head node; the body stays on the
  // unscaled head width so the charm dial doesn't change the physique.
  const hH = headH * (config.headScale ?? 1)
  const hR = hH * 0.51
  const eyeS = config.eyeScale ?? 1
  add('head', blob(hR, 14, 11, 1, 0.9, 0.95), colors.skin, [0, hH * 0.48, 0])
  const faceZ = hR * 0.95
  // Neck (optional, default 0 = AC style): lives in the HEAD node so it
  // moves with the look-at, embedded into skull and collar.
  const neckLen = config.neckLength ?? 0.06
  if (neckLen > 0) {
    add(
      'head',
      new THREE.CylinderGeometry(hR * 0.3, hR * 0.32, neckLen + hH * 0.16, 10),
      colors.skin,
      [0, -(neckLen + hH * 0.16) / 2 + hH * 0.06, 0],
    )
  }
  // Ears: small rounded lobes protruding from the head sides — they
  // carry the chibi read from behind, where the face is hidden. They
  // sit at mid-face height, BELOW the hair cap's side edge (higher and
  // both hair styles swallow them).
  const earSize = config.earSize ?? 1
  for (const sx of [-1, 1]) {
    add('head', blob(hR * 0.18 * earSize, 8, 6, 0.6, 1, 0.85), colors.skin, [
      sx * hR * 1.0,
      hH * 0.38,
      -hH * 0.02,
    ])
  }
  // Tiny rounded nose just above the mouth (soft peach).
  if ((config.noseStyle ?? 'round') !== 'none') {
    add('head', blob(hH * 0.034 * (config.noseSize ?? 1), 6, 4, 1, 0.85, 0.65), '#f0b48a', [
      0,
      hH * 0.39,
      faceZ * 0.99,
    ])
  }
  // Eyes. Bespectacled faces (v3.18): the rims are SMALL and the eye
  // EXISTS behind them — white sclera + dark pupil + highlight dot,
  // clearly visible within a thin rim (over-sized rims over dark ovals
  // read as solid voids). Bare faces keep the big AC oval + highlight.
  if (config.glasses) {
    const gS = config.glassesScale ?? 1
    const ex = hR * 0.34
    for (const sx of [-1, 1]) {
      add('head', blob(hH * 0.052 * eyeS, 8, 6, 1, 1.2, 0.45), '#ffffff', [
        sx * ex,
        hH * 0.5,
        faceZ - 0.01,
      ])
      // Pupil clearly SMALLER than the sclera — a pupil that fills the
      // rim reads as a void again, just a smaller one.
      add('head', blob(hH * 0.024 * eyeS, 8, 6, 1, 1.25, 0.5), colors.eyes, [
        sx * ex,
        hH * 0.495,
        faceZ + 0.01,
      ])
      add('head', blob(hH * 0.012 * eyeS, 6, 4, 1, 1, 0.6), '#ffffff', [
        sx * ex + sx * 0.007,
        hH * 0.525,
        faceZ + 0.026,
      ])
      add(
        'head',
        new THREE.TorusGeometry(hH * 0.072 * gS, 0.0072, 4, 12),
        config.glasses.color,
        [sx * ex, hH * 0.5, faceZ + 0.02],
      )
    }
    add('head', new THREE.BoxGeometry(hR * 0.26, 0.014, 0.014), config.glasses.color, [
      0,
      hH * 0.52,
      faceZ + 0.018,
    ])
  } else {
    for (const sx of [-1, 1]) {
      add('head', blob(hH * 0.1 * eyeS, 8, 6, 1, 1.55, 0.45), colors.eyes, [
        sx * hR * 0.38,
        hH * 0.5,
        faceZ - 0.02,
      ])
      add('head', blob(hH * 0.028 * eyeS, 6, 4, 1, 1, 0.6), '#ffffff', [
        sx * hR * 0.38 + sx * 0.008,
        hH * 0.56,
        faceZ + 0.028,
      ])
    }
  }
  // Micro-arc mouth: partial torus rotated so the arc hangs at the circle's
  // bottom — endpoints curve upward, reading as the AC smile.
  add(
    'head',
    new THREE.TorusGeometry(hH * 0.055, 0.0075, 4, 8, Math.PI * 0.75),
    colors.eyes,
    [0, hH * 0.32, faceZ * 0.92],
    [0, 0, -Math.PI * 0.875],
  )
  if (config.blush) {
    for (const sx of [-1, 1]) {
      add('head', blob(hH * 0.07, 6, 4, 1, 0.7, 0.3), '#f0a2a2', [
        sx * hR * 0.62,
        hH * 0.37,
        faceZ * 0.82,
      ])
    }
  }
  // Hair — SOLID volumes only (open shells backface-cull see-through),
  // fringes overlapped DEEP into the cap so the hair reads as ONE mass.
  if (config.hair === 'swoop') {
    // High hairline (the cap centered lower swallows the face); the
    // fringe overlaps deep into the cap so the hair reads as one mass.
    add('head', blob(hR * 1.09, 12, 9, 1, 0.76, 1.0), colors.hair, [0, hH * 0.64, -0.015])
    add(
      'head',
      blob(hR * 0.58, 8, 6, 1.5, 0.45, 0.6),
      colors.hair,
      [hR * 0.1, hH * 0.79, faceZ * 0.5],
      [0.05, 0, -0.24],
    )
  } else if (config.hair === 'bob') {
    add('head', blob(hR * 1.1, 12, 9, 1, 0.92, 0.98), colors.hair, [0, hH * 0.58, -0.055])
    add(
      'head',
      blob(hR * 0.68, 8, 6, 1.3, 0.4, 0.5),
      colors.hair,
      [0, hH * 0.82, faceZ * 0.48],
      [0.18, 0, 0],
    )
  }

  // ---- Arm (local origin at the shoulder pivot, hangs along −y) --------
  // Slim capsule mounted under the sloped shoulder; the A-pose rest
  // splay lives in the rig. A short SLIM sleeve cap in the top color
  // covers the mount (tee, not tank — v3.18); skin starts below it.
  const armR = 0.036 * (H / 1.25) * (config.limbThick ?? 1)
  add('arm', new THREE.CapsuleGeometry(armR, armLen * 0.6, 3, 8), colors.skin, [
    0,
    -armLen * 0.42,
    0,
  ])
  const sleeveLen = config.sleeveLen ?? 1
  if (sleeveLen > 0) {
    add(
      'arm',
      new THREE.CapsuleGeometry(armR * 1.2, armLen * 0.18 * sleeveLen, 2, 8),
      colors.top,
      [0, -armLen * 0.1 * sleeveLen, 0],
    )
  }
  add('arm', new THREE.SphereGeometry(armR * 1.4, 8, 6), colors.skin, [0, -armLen * 0.84, 0])

  // ---- Leg (local origin at the hip pivot; soles at −legLen) -----------
  const legR = 0.045 * (H / 1.25) * (config.limbThick ?? 1)
  add('leg', new THREE.CapsuleGeometry(legR, legLen * 0.5, 3, 8), colors.skin, [
    0,
    -legLen * 0.4,
    0,
  ])
  if (config.outfit !== 'dress') {
    // Shorts cuff on the upper thigh — riding the leg node it swings
    // like fabric; two cuffs leave daylight at the inseam.
    add('leg', new THREE.CylinderGeometry(legR * 1.5, legR * 1.42, legLen * 0.55, 10), colors.bottom, [
      0,
      -legLen * 0.24,
      0,
    ])
  }
  // Small rounded shoe, toe forward; bottom kisses rig-local y = −legLen
  // so the planted feet sit exactly at groundHeightAt (blob-shadow
  // contract).
  const shoeR = legR * 1.5
  add('leg', blob(shoeR, 10, 7, 1, 0.6, 1.3), colors.shoes, [0, -legLen + shoeR * 0.6, 0.025])

  const merge = (list: THREE.BufferGeometry[]) => {
    const merged = mergeGeometries(list)
    list.forEach((g) => g.dispose())
    return merged
  }
  return {
    nodes: {
      torso: merge(parts.torso),
      head: merge(parts.head),
      arm: merge(parts.arm),
      leg: merge(parts.leg),
    },
    dims: {
      legLen,
      torsoH,
      hipX: 0.085 * H,
      // Mounts sink BENEATH the shoulder slope (v3.17): the capsule top
      // never crests the torso curve; the A-pose carries the arm out
      // from under it (the sleeve cap covers the exit) and the hands
      // clear the hips.
      shoulderX: shoulderR * 0.78,
      shoulderY: torsoH * 0.8,
    },
  }
}

/** Characters are the deliberate smooth-shading exception (see header). */
const characterMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false })

export function BlockyCharacter({
  config,
  motion,
}: {
  config: CharacterConfig
  /** Read each frame — returns the controller (or NPC brain) state. */
  motion: () => MotionState
}) {
  const { nodes, dims } = useMemo(() => buildNodes(config), [config])
  const restSplay = THREE.MathUtils.degToRad(config.armRestDeg ?? 28)

  const rig = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)

  // Live animation state — mutated in place every frame, zero allocations.
  const live = useRef({
    p: { ...STATES.idle },
    swingPhase: 0,
    bobPhase: 0,
    scaleXZ: 1,
    scaleY: 1,
    landT: 0,
    wasAirborne: false,
    headYaw: 0,
    headPitch: 0,
  })

  useFrame((state, dt) => {
    const g = rig.current
    if (!g || !armL.current || !armR.current || !legL.current || !legR.current) return
    const m = motion()
    const s = live.current
    const target = m.airborne ? STATES.air : STATES[m.locomotion]

    // Landing squash: fires on the airborne → grounded edge.
    if (s.wasAirborne && !m.airborne) s.landT = LAND_S
    s.wasAirborne = m.airborne
    if (s.landT > 0) s.landT -= dt

    // Lerped-parameter crossfade (~0.15 s time constant) — playbook §2.
    const k = 1 - Math.exp(-dt / BLEND_TAU)
    const p = s.p
    p.bobAmp += (target.bobAmp - p.bobAmp) * k
    p.bobFreq += (target.bobFreq - p.bobFreq) * k
    p.swingAmp += (target.swingAmp - p.swingAmp) * k
    p.swingFreq += (target.swingFreq - p.swingFreq) * k
    p.armRatio += (target.armRatio - p.armRatio) * k
    p.lean += (target.lean - p.lean) * k
    p.sway += (target.sway - p.sway) * k
    p.air += (target.air - p.air) * k

    // Phases advance at the LIVE frequency so freq blends never pop.
    s.swingPhase += p.swingFreq * dt
    s.bobPhase += p.bobFreq * dt

    const swing = Math.sin(s.swingPhase) * p.swingAmp
    const ground = 1 - p.air
    legL.current.rotation.x = swing * ground + AIR_POSE.legL * p.air
    legR.current.rotation.x = -swing * ground + AIR_POSE.legR * p.air
    const armSwing = swing * p.armRatio
    const t = state.clock.elapsedTime
    const sway = Math.sin(t * 1.7) * p.sway
    armL.current.rotation.x = -armSwing * ground + AIR_POSE.armL * p.air
    armR.current.rotation.x = armSwing * ground + AIR_POSE.armR * p.air
    // True A-POSE rest (config.armRestDeg, ~25–30° per the chibi
    // references) — the arms emerge from under the shoulder slope and
    // hang clearly separated; walk/run swings COMPOSE on this base angle
    // (never collapse back to pinned). Sign note: +z rotation swings a
    // hanging tip toward +x, so the LEFT arm (−x) splays OUTWARD with
    // NEGATIVE z.
    const splay = restSplay + p.swingAmp * 0.06 + AIR_POSE.splay * p.air
    armL.current.rotation.z = -splay - sway
    armR.current.rotation.z = splay + sway

    // Head look-at (v3.3): ease toward the camera when idle (clamped ±60°
    // yaw / ±25° pitch — beyond the clamp, ease back to neutral); while
    // moving, follow travel with only a subtle glance. Gentle sway keeps
    // standing still alive (blink skipped: eyes are merged into the head).
    const h = head.current
    if (h) {
      const rel = wrapPi(m.azimuth - m.avatarYaw)
      const idleness = 1 - Math.min(1, p.swingAmp / 0.4)
      let yawTarget: number
      let pitchTarget: number
      if (idleness > 0.5) {
        // Two targets with a blended handoff (v3.4): eye contact with the
        // camera in the frontal cone; the camera's AIM POINT (its forward,
        // which passes through the avatar toward the scene) when the camera
        // sits behind/beside — the character glances where the player looks.
        const eyeYaw = THREE.MathUtils.clamp(rel, -HEAD_YAW_MAX, HEAD_YAW_MAX)
        const eyePitch = -THREE.MathUtils.clamp(m.camPitch * 0.7, -HEAD_PITCH_MAX, HEAD_PITCH_MAX)
        // 1.35× gain: a rear glance is seen from behind the head, where
        // small yaws vanish under the hair cap — amplify toward the clamp
        // so the glance actually reads in-game.
        const aimRel = wrapPi(rel + Math.PI)
        const aimYaw = THREE.MathUtils.clamp(aimRel * 1.35, -HEAD_YAW_MAX, HEAD_YAW_MAX)
        const aimPitch = THREE.MathUtils.clamp(m.camPitch * 0.3, -HEAD_PITCH_MAX, HEAD_PITCH_MAX)
        const w = THREE.MathUtils.smoothstep(Math.abs(rel), HEAD_CONE_IN, HEAD_CONE_OUT)
        yawTarget = THREE.MathUtils.lerp(eyeYaw, aimYaw, w)
        pitchTarget = THREE.MathUtils.lerp(eyePitch, aimPitch, w)
      } else {
        yawTarget = THREE.MathUtils.clamp(wrapPi(rel), -HEAD_GLANCE_MAX, HEAD_GLANCE_MAX)
        pitchTarget = 0
      }
      const hk = 1 - Math.exp(-dt / HEAD_TAU)
      s.headYaw += (yawTarget - s.headYaw) * hk
      s.headPitch += (pitchTarget - s.headPitch) * hk
      const sway = idleness * ground
      h.rotation.y = s.headYaw + Math.sin(t * 0.5) * 0.035 * sway
      h.rotation.x = s.headPitch
      h.rotation.z = Math.sin(t * 0.31) * 0.02 * sway
    }

    // Body: bob (idle breathes, steps sync at 2× swing), lean, squash/stretch.
    g.position.y = Math.abs(Math.sin(s.bobPhase)) * p.bobAmp * ground
    g.rotation.x = p.lean
    const txz = m.airborne ? STRETCH.xz : s.landT > 0 ? SQUASH.xz : 1
    const ty = m.airborne ? STRETCH.y : s.landT > 0 ? SQUASH.y : 1
    s.scaleXZ += (txz - s.scaleXZ) * k
    s.scaleY += (ty - s.scaleY) * k
    g.scale.set(s.scaleXZ, s.scaleY, s.scaleXZ)
  })

  return (
    <group ref={rig}>
      <group ref={legL} position={[-dims.hipX, dims.legLen, 0]}>
        <mesh geometry={nodes.leg} material={characterMaterial} />
      </group>
      <group ref={legR} position={[dims.hipX, dims.legLen, 0]}>
        <mesh geometry={nodes.leg} material={characterMaterial} />
      </group>
      <group position={[0, dims.legLen, 0]}>
        <mesh geometry={nodes.torso} material={characterMaterial} />
        <group ref={armL} position={[-dims.shoulderX, dims.shoulderY, 0]}>
          <mesh geometry={nodes.arm} material={characterMaterial} />
        </group>
        <group ref={armR} position={[dims.shoulderX, dims.shoulderY, 0]}>
          <mesh geometry={nodes.arm} material={characterMaterial} />
        </group>
        <group ref={head} position={[0, dims.torsoH, 0]}>
          <mesh geometry={nodes.head} material={characterMaterial} />
        </group>
      </group>
    </group>
  )
}
