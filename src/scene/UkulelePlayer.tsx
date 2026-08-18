import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { placement } from '../content/placements'
import { usePlacementRuntime } from './placementRuntime'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { audioRuntime, onArmed, onAudioResume, registerVoice, routeToBus, syncPanner } from '../audio/core'
import { makeStrumBuffer, mulberry32 } from '../audio/procedural'
import { KOA } from '../content/characters'
import { groundAltitudeAt } from '../controls/terrain'
import { useStore } from '../store/useStore'
import { BlockyCharacter, type MotionState } from './BlockyCharacter'
import { tintGeometry } from './geometryUtils'
import { DOCK } from './planetConfig'
import { normalizeForMerge } from './props'
import { SurfaceGroup } from './SurfaceGroup'

/**
 * The uke as ONE vertex-tinted mesh (draw-call budget), built in its own
 * local frame: soundboard faces +y, neck along +x toward the character's
 * anatomical LEFT once mounted. Chunky low-poly proportions per the
 * style bible — wide rounded body, short thick neck, headstock block.
 * Landmarks (uke-local) for the arm solve live in UKE.
 */
const ukeGeo = (() => {
  const parts: THREE.BufferGeometry[] = []
  const add = (g: THREE.BufferGeometry, color: string, m: THREE.Matrix4) => {
    const n = tintGeometry(normalizeForMerge(g), color)
    g.dispose()
    n.applyMatrix4(m)
    parts.push(n)
  }
  // Wide rounded body (~0.4 m across), flattened.
  add(
    new THREE.SphereGeometry(0.17, 12, 8),
    '#b5773f',
    new THREE.Matrix4().makeScale(1.15, 0.5, 1),
  )
  // Soundhole on the board.
  add(
    new THREE.CylinderGeometry(0.055, 0.055, 0.02, 10),
    '#3a2a1c',
    new THREE.Matrix4().setPosition(0.04, 0.082, 0),
  )
  // Short thick neck + headstock block.
  add(
    new THREE.BoxGeometry(0.3, 0.045, 0.075),
    '#8a5a3a',
    new THREE.Matrix4().setPosition(0.3, 0.02, 0),
  )
  add(
    new THREE.BoxGeometry(0.09, 0.055, 0.095),
    '#5a4632',
    new THREE.Matrix4().setPosition(0.48, 0.03, 0),
  )
  return mergeGeometries(parts)
})()
const ukeMat = new THREE.MeshLambertMaterial({ vertexColors: true })

/** Bug pass 3 (the sideways uke): the mount orientation is built from
 * EXPLICIT torso-basis vectors — raw Eulers guessed in the wrong basis
 * are what turned it sideways. Torso space: +x = the character's
 * anatomical LEFT (the rig's armR side), +y up, +z out of the chest
 * (faceZ is +z in the rig). Wanted: body cradled over the lap,
 * soundboard (uke-local +y) facing OUTWARD from the chest with a
 * slight upward cradle tilt, neck (uke-local +x) angled ~35° up toward
 * his left. The basis is orthonormalized so the matrix is always a
 * pure rotation. */
const UKE_ORIENTATION = (() => {
  const neckUp = THREE.MathUtils.degToRad(35)
  // Neck direction: toward his left, pitched 35° up.
  const x = new THREE.Vector3(Math.cos(neckUp), Math.sin(neckUp), 0)
  // Soundboard normal: out of the chest, tilted up into the cradle;
  // orthogonalized against the neck.
  const y = new THREE.Vector3(0, 0.35, 0.94)
  y.addScaledVector(x, -y.dot(x)).normalize()
  const z = new THREE.Vector3().crossVectors(x, y)
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
})()

/** Torso-local mount + uke-local landmarks (the arm pose in koaPose
 * targets these; helpers below express them in torso space). */
const UKE = {
  position: new THREE.Vector3(0.03, 0.16, 0.26),
  quaternion: UKE_ORIENTATION,
  /** Mid-neck, where the fret hand grips (uke-local). */
  neckGrip: new THREE.Vector3(0.3, 0.04, 0),
  /** Body center, where the strum forearm sweeps (uke-local). */
  strumPoint: new THREE.Vector3(0.02, 0.1, 0),
}
/** Landmark in torso space — the target the matching hand reaches for. */
export function ukeLandmarkTorso(local: THREE.Vector3): THREE.Vector3 {
  return local.clone().applyQuaternion(UKE.quaternion).add(UKE.position)
}

/**
 * Koa, the ukulele player (3C) — first villager on the shared rig.
 * Seated on the dock edge (map table), legs dangling over the water,
 * facing the sun. Strums are WebAudio-scheduled ahead of time; the
 * strum arm, head bob, and ♪ note sprites all key off the SAME
 * schedule, so sight and sound never drift. Fully lazy: nothing
 * audio-side exists before the first gesture (onArmed).
 *
 * Draw-call budget: the uke merges into the torso node's sibling as ONE
 * mesh, and the note sprites are ONE THREE.Points cloud — the whole
 * ensemble adds rig(6) + uke(1) + notes(1).
 */

/** Bug pass 2 (the floating NPC): Koa's altitude derives from the
 * DOCK's analytic deck strip — groundAltitudeAt evaluated ON the strip
 * (DOCK.longDeg), the same function the controller walks — never from
 * the sand/water band under his overhang, which is what floated him.
 * Seat contact = deck top − a 2 cm bite; the rig root sits
 * KOA_SEAT.seatToRootM below the seat (stubby-leg rig: the torso
 * bottom rides ~0.12 above the root plane). Vitest pins all of it. */
export const KOA_SEAT = {
  seatBiteM: 0.02,
  seatToRootM: 0.12,
  // The dock's deck height at his authored latitude — a constant, not
  // a live read: KOA_SEAT is consumed at import by the pose math.
  deckTopAlt: groundAltitudeAt(placement('koa').lat, DOCK.longDeg),
  get altitude(): number {
    return this.deckTopAlt - this.seatBiteM - this.seatToRootM
  },
}

const BPM = 92
const BEAT = 60 / BPM
/** Strum offsets within a 4-beat bar (island D-D-U-UDU feel). */
const BAR_PATTERN = [0, 1, 1.75, 2.5, 3, 3.5]
const CHORD_PER_BARS = 2
const NOTE_LIFE_S = 2.5
const NOTE_COUNT = 4

interface Strum {
  time: number
  chord: number
}

export function UkulelePlayer() {
  // Follows its placement, so the dev editor can move it.
  const koaPos = usePlacementRuntime((st) => st.list.find((p) => p.id === 'koa')) ?? placement('koa')

  const { camera } = useThree()
  const rigGroup = useRef<THREE.Group>(null)
  const notesRef = useRef<THREE.Points>(null)

  // ---- audio scheduling state (armed lazily) -------------------------
  const audio = useRef({
    nodes: [] as THREE.PositionalAudio[],
    buffers: [] as AudioBuffer[][],
    nextBar: 0,
    strumCount: 0,
    barStartTime: 0,
    strums: [] as Strum[],
    rng: mulberry32(0x0a1de),
    armed: false,
  })

  useMemo(() => {
    onArmed(() => {
      const rt = audioRuntime
      const group = rigGroup.current
      if (!rt.listener || !rt.ctx || !group) return
      const a = audio.current
      // 3 round-robin positional nodes so strum tails overlap freely.
      for (let i = 0; i < 3; i++) {
        const node = new THREE.PositionalAudio(rt.listener)
        node.setRefDistance(4)
        node.setDistanceModel('exponential')
        node.setRolloffFactor(1.6)
        group.add(node)
        routeToBus(node, 'world')
        a.nodes.push(node)
      }
      // 4 chords × 2 humanized variants, generated once.
      a.buffers = [0, 1, 2, 3].map((c) => [
        makeStrumBuffer(rt.ctx as AudioContext, c, 100 + c),
        makeStrumBuffer(rt.ctx as AudioContext, c, 200 + c),
      ])
      a.barStartTime = rt.ctx.currentTime + 0.3
      a.armed = true
      // Tab return: NEVER replay the hidden gap — restart the bar clock
      // from now and forget bookkept strums (their sources were frozen
      // with the suspended context; at most the ~0.8 s lookahead plays).
      onAudioResume((now) => {
        a.barStartTime = now + 0.3
        a.strums.length = 0
      })
    })
  }, [])

  // ---- ♪ note sprites: one Points cloud, canvas-generated glyph ------
  const { noteGeo, noteMat, noteLife } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const ctx2d = canvas.getContext('2d')
    if (ctx2d) {
      ctx2d.font = '48px serif'
      ctx2d.textAlign = 'center'
      ctx2d.textBaseline = 'middle'
      ctx2d.fillStyle = '#fff3d6'
      ctx2d.fillText('♪', 32, 34)
    }
    const tex = new THREE.CanvasTexture(canvas)
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(NOTE_COUNT * 3).fill(9999)
    const col = new Float32Array(NOTE_COUNT * 3)
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const mat = new THREE.PointsMaterial({
      size: 0.38,
      map: tex,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      sizeAttenuation: true,
    })
    return { noteGeo: geo, noteMat: mat, noteLife: new Float32Array(NOTE_COUNT).fill(-1) }
  }, [])

  // ---- per-frame: schedule ahead, animate, spawn/advance notes -------
  const pose = useRef({ lastStrumT: -10, notesCursor: 0 })
  const _v = useMemo(() => new THREE.Vector3(), [])
  const _m = useMemo(() => new THREE.Matrix4(), [])

  useFrame((state, rawDt) => {
    // Clamped delta: a resumed tab hands the first frame the whole
    // hidden gap — nothing here may integrate it.
    const dt = Math.min(rawDt, 0.1)
    const a = audio.current
    const rt = audioRuntime
    const now = rt.ctx?.currentTime ?? state.clock.elapsedTime
    if (a.armed && rt.ctx) {
      // THE silent-uke fix: these nodes carry custom scheduled sources,
      // so three never updates their panners — sync manually, every
      // frame (the planet rotates under the NPC).
      for (const node of a.nodes) syncPanner(node)
      {
        const w = window as unknown as { __ukePanner?: number[] }
        const p = a.nodes[0]?.panner
        if (p?.positionX) w.__ukePanner = [p.positionX.value, p.positionY.value, p.positionZ.value]
      }
      // Stall guard (tab-return blast fix): if the bar clock fell more
      // than 0.25 s behind — hidden tab with no visibility event,
      // alt-tab throttling, a breakpoint — skip FORWARD to now instead
      // of scheduling the backlog. Bars are 2.6 s against a 0.8 s
      // lookahead, so the while below never schedules more than one bar
      // per frame in normal play.
      if (a.barStartTime < now - 0.25) {
        a.barStartTime = now + 0.1
        a.strums.length = 0
      }
      // Schedule bars ~0.8 s ahead.
      while (a.barStartTime < now + 0.8) {
        const chord = Math.floor(a.nextBar / CHORD_PER_BARS) % 4
        for (const beat of BAR_PATTERN) {
          const t = a.barStartTime + beat * BEAT + (a.rng() * 2 - 1) * 0.018
          const node = a.nodes[a.strumCount++ % a.nodes.length]
          const buffer = a.buffers[chord][a.rng() < 0.5 ? 0 : 1]
          const src = rt.ctx.createBufferSource()
          src.buffer = buffer
          src.playbackRate.value = 1 + (a.rng() * 2 - 1) * 0.02
          const g = rt.ctx.createGain()
          g.gain.value = 0.55 + a.rng() * 0.12
          src.connect(g)
          // Into the PANNER so the strum is spatialized like the node's
          // own buffer would be.
          g.connect(node.panner)
          // Voice cap 6: ≤2 scheduled ahead + ~3 sounding tails is the
          // legitimate ceiling; anything past it is a stall artifact.
          registerVoice('uke-strum', src, 6)
          src.start(t)
          a.strums.push({ time: t, chord })
          const w = window as unknown as { __ukeSched?: number }
          w.__ukeSched = (w.__ukeSched ?? 0) + 1
        }
        a.barStartTime += 4 * BEAT
        a.nextBar++
      }
      // Consume strums whose time has arrived: arm anim + note spawn.
      // Catch-up cap: the queue drains, but the flick/note EFFECT fires
      // at most once per frame (strums sit 0.65 s apart in normal play —
      // more than one due in a frame is always a stall artifact).
      let consumed = 0
      while (a.strums.length && a.strums[0].time <= now) {
        a.strums.shift()
        if (consumed++ > 0) continue
        pose.current.lastStrumT = state.clock.elapsedTime
        const w = window as unknown as { __ukeStrums?: number }
        w.__ukeStrums = (w.__ukeStrums ?? 0) + 1
        if (useStore.getState().qualityTier !== 'low' && notesRef.current) {
          const i = pose.current.notesCursor % NOTE_COUNT
          pose.current.notesCursor++
          noteLife[i] = NOTE_LIFE_S
          const posAttr = noteGeo.attributes.position as THREE.BufferAttribute
          posAttr.setXYZ(i, 0.35 + Math.random() * 0.2, 1.0, 0.3 + Math.random() * 0.2)
          posAttr.needsUpdate = true
        }
      }
    }
    // Advance note sprites (planet-local drift up + fade).
    const posAttr = noteGeo.attributes.position as THREE.BufferAttribute
    const colAttr = noteGeo.attributes.color as THREE.BufferAttribute
    let dirty = false
    for (let i = 0; i < NOTE_COUNT; i++) {
      if (noteLife[i] <= 0) continue
      noteLife[i] -= dt
      dirty = true
      if (noteLife[i] <= 0) {
        posAttr.setXYZ(i, 9999, 9999, 9999)
        colAttr.setXYZ(i, 0, 0, 0)
      } else {
        posAttr.setY(i, posAttr.getY(i) + dt * 0.45)
        const f = Math.min(1, noteLife[i] / NOTE_LIFE_S)
        colAttr.setXYZ(i, f, f * 0.95, f * 0.85)
      }
    }
    if (dirty) {
      posAttr.needsUpdate = true
      colAttr.needsUpdate = true
    }
    // An all-dead Points still costs a draw call — hide it entirely.
    if (notesRef.current) {
      notesRef.current.visible = noteLife.some((l) => l > 0)
    }
  })

  // Seated pose + strum arm + look-at feed. The rig's standard idle
  // runs first; the hook composes the NPC specifics on top.
  const koaMotion = (): MotionState => {
    const group = rigGroup.current
    let azimuth = Math.PI
    if (group) {
      _m.copy(group.matrixWorld).invert()
      _v.copy(camera.position).applyMatrix4(_m)
      azimuth = Math.atan2(_v.x, _v.z)
      // Beyond ~7 m the glance goes neutral (rig clamps handle the rest).
      if (_v.length() > 7) azimuth = Math.PI
    }
    return { locomotion: 'idle', airborne: false, azimuth, avatarYaw: 0, camPitch: 0.1 }
  }
  const koaPose: NonNullable<Parameters<typeof BlockyCharacter>[0]['poseHook']> = ({
    armL,
    armR,
    foreL,
    foreR,
    legL,
    legR,
    head,
    t,
  }) => {
    // Dangling legs over the edge — forward flex is NEGATIVE x on this
    // rig (AIR_POSE convention); +0.55 pointed them backward under the
    // deck. Gentle alternate kicks.
    legL.rotation.x = -0.55 - Math.sin(t * 1.3) * 0.08
    legR.rotation.x = -0.55 - Math.sin(t * 1.3 + Math.PI) * 0.08
    // Arms solved NUMERICALLY onto the uke landmarks (throwaway grid
    // probe over the real rig chain, torso space): the fret wrist
    // (armR — the character's anatomical left, neck side) lands on
    // UKE.neckGrip within ~2 mm; the strum arm (armL) aims its wrist
    // at UKE.strumPoint with a resting elbow bend so the STRUM flick
    // rotates from the ELBOW, sweeping the wrist through the point.
    armR.rotation.x = -0.95
    armR.rotation.z = 0.25
    if (foreR) {
      foreR.rotation.x = -0.95
      foreR.rotation.z = 0.42
    }
    const since = t - pose.current.lastStrumT
    const flick = since < 0.18 ? Math.sin((since / 0.18) * Math.PI) : 0
    armL.rotation.x = -1.15
    armL.rotation.z = 0.35
    if (foreL) {
      foreL.rotation.x = -0.25 - flick * 0.45
      foreL.rotation.z = 0
    }
    // Head bob on the beat.
    head.rotation.z += Math.sin((t * BPM) / 60 * Math.PI) * 0.04
  }

  // The uke: tiny primitive assembly, ONE merged-material mesh group.
  return (
    <SurfaceGroup
      lat={koaPos.lat}
      long={koaPos.long}
      altitude={KOA_SEAT.altitude}
      yaw={-Math.PI / 2 - 0.45}
    >
      <group ref={rigGroup}>
        <BlockyCharacter
          config={KOA}
          motion={koaMotion}
          poseHook={koaPose}
          torsoAttachment={
            /* TORSO-space mount — the uke can never detach from the
               body again (root-space anchoring was the float bug). */
            <mesh geometry={ukeGeo} material={ukeMat} position={UKE.position} quaternion={UKE.quaternion} />
          }
        />
        {/* renderOrder 2: after the water (1) — same transparent-sort
            stomp as the flame; the notes float over open water. */}
        <points ref={notesRef} geometry={noteGeo} material={noteMat} position={[0, 0.4, 0]} renderOrder={2} />
      </group>
    </SurfaceGroup>
  )
}
