import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { CharacterConfig } from '../content/characters'
import { tintGeometry } from './geometryUtils'

/**
 * BlockyCharacter — the style bible's chibi rig (playbook §1–2): oversized
 * rounded head, stubby pivot-group limbs, no fingers, big flat eyes. Each
 * rigid node (torso, head, arm, leg) merges its colored pieces into ONE
 * vertex-colored geometry, so a whole character costs 6 draw calls with a
 * single shared Lambert material.
 *
 * Animation is pure transform math on the pivot groups — no skeleton, no
 * AnimationMixer. One parameter set per state (idle/walk/run/air); the live
 * parameters lerp toward the active state's targets (~0.15 s time constant),
 * which IS the crossfade.
 */

export interface MotionState {
  locomotion: 'idle' | 'walk' | 'run'
  airborne: boolean
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

const STATES: Record<'idle' | 'walk' | 'run' | 'air', Params> = {
  idle: { bobAmp: 0.022, bobFreq: 2, swingAmp: 0, swingFreq: 0, armRatio: 0, lean: 0, sway: 0.06, air: 0 },
  walk: { bobAmp: 0.03, bobFreq: 18, swingAmp: 0.5, swingFreq: 9, armRatio: 0.6, lean: 0.03, sway: 0, air: 0 },
  run: { bobAmp: 0.05, bobFreq: 25, swingAmp: 0.8, swingFreq: 12.5, armRatio: 0.75, lean: 0.14, sway: 0, air: 0 },
  air: { bobAmp: 0, bobFreq: 0, swingAmp: 0, swingFreq: 0, armRatio: 0, lean: 0.05, sway: 0, air: 1 },
}

/** Airborne pose angles (rad) — asymmetric so the jump reads dynamic. */
const AIR_POSE = { legL: -0.45, legR: 0.25, armL: -0.65, armR: -0.5, splay: 0.22 }
/** Squash & stretch scales, roughly volume-preserving (playbook §2). */
const STRETCH = { xz: 0.93, y: 1.14 }
const SQUASH = { xz: 1.09, y: 0.85 }
const LAND_S = 0.18
const BLEND_TAU = 0.15

function rounded(w: number, h: number, d: number, r: number): RoundedBoxGeometry {
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2))
}

/** Build the four merged node geometries from a config. */
function buildNodes(config: CharacterConfig) {
  const { height: H, headsTall, build, colors } = config
  const headH = H / headsTall
  const legLen = H * 0.22
  const torsoH = H - headH - legLen
  const torsoW = 0.34 * H * build
  const torsoD = 0.21 * H
  const headW = headH * 0.95
  const headD = headH * 0.88
  const armLen = torsoH * 0.85
  const armW = 0.105 * H
  const legW = 0.12 * H
  const shoeH = 0.07 * H

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
    tintGeometry(geo, color)
    if (rot) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)))
    geo.applyMatrix4(new THREE.Matrix4().makeTranslation(...pos))
    parts[bucket].push(geo)
  }

  // Torso: tee over shorts (local origin at the hips / leg tops).
  add('torso', rounded(torsoW, torsoH * 0.72, torsoD, 0.05), colors.top, [0, torsoH * 0.62, 0])
  add('torso', rounded(torsoW + 0.015, torsoH * 0.36, torsoD + 0.015, 0.04), colors.bottom, [0, torsoH * 0.18, 0])

  // Head node (local origin at the neck). Oversized rounded box + flat eyes.
  add('head', rounded(headW, headH, headD, 0.09), colors.skin, [0, headH / 2, 0])
  const eyeGeo = () =>
    new THREE.SphereGeometry(headH * 0.082, 12, 8).applyMatrix4(
      new THREE.Matrix4().makeScale(1, 1.5, 0.45),
    )
  for (const sx of [-1, 1]) {
    add('head', eyeGeo(), colors.eyes, [sx * headW * 0.2, headH * 0.52, headD / 2 - 0.005])
  }
  if (config.hair === 'swoop') {
    add('head', rounded(headW + 0.05, headH * 0.38, headD + 0.05, 0.08), colors.hair, [0, headH * 0.86, -0.01])
    add('head', rounded(headW + 0.05, headH * 0.45, 0.12, 0.05), colors.hair, [0, headH * 0.6, -(headD / 2 - 0.02)])
    // The swoop: a fringe swept to one side across the forehead.
    add(
      'head',
      rounded(headW * 0.62, headH * 0.16, 0.12, 0.04),
      colors.hair,
      [headW * 0.1, headH * 0.72, headD / 2 - 0.03],
      [0, 0, -0.22],
    )
  }
  if (config.glasses) {
    const rim = () => new THREE.TorusGeometry(headH * 0.115, 0.011, 6, 14)
    for (const sx of [-1, 1]) {
      add('head', rim(), config.glasses.color, [sx * headW * 0.2, headH * 0.52, headD / 2 + 0.012])
    }
    add('head', new THREE.BoxGeometry(headW * 0.14, 0.02, 0.02), config.glasses.color, [0, headH * 0.52, headD / 2 + 0.012])
  }

  // Arm node (local origin at the shoulder pivot, hangs along −y).
  add('arm', rounded(armW, armLen, armW, 0.045), colors.skin, [0, -armLen / 2 + 0.02, 0])
  add('arm', rounded(armW + 0.035, armLen * 0.32, armW + 0.035, 0.04), colors.top, [0, -armLen * 0.12, 0])

  // Leg node (local origin at the hip pivot): stubby leg + shoe, toe forward.
  add('leg', rounded(legW, legLen * 0.85, legW, 0.04), colors.skin, [0, -legLen * 0.42, 0])
  add('leg', rounded(legW + 0.04, shoeH, legW + 0.1, 0.03), colors.shoes, [0, -legLen + shoeH / 2, 0.035])

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
      hipX: torsoW * 0.26,
      shoulderX: torsoW / 2 + armW / 2 - 0.015,
      shoulderY: torsoH * 0.88,
    },
  }
}

const characterMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })

export function BlockyCharacter({
  config,
  motion,
}: {
  config: CharacterConfig
  /** Read each frame — returns the controller (or NPC brain) state. */
  motion: () => MotionState
}) {
  const { nodes, dims } = useMemo(() => buildNodes(config), [config])

  const rig = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)

  // Live animation state — mutated in place every frame, zero allocations.
  const live = useRef({
    p: { ...STATES.idle },
    swingPhase: 0,
    bobPhase: 0,
    scaleXZ: 1,
    scaleY: 1,
    landT: 0,
    wasAirborne: false,
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
    armL.current.rotation.z = 0.08 + sway + AIR_POSE.splay * p.air
    armR.current.rotation.z = -0.08 - sway - AIR_POSE.splay * p.air

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
        <group position={[0, dims.torsoH, 0]}>
          <mesh geometry={nodes.head} material={characterMaterial} />
        </group>
      </group>
    </group>
  )
}
