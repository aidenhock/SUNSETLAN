import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { stepSound } from '../audio/footsteps'
import type { CharacterConfig } from '../content/characters'
import { poleInPlanetSpace, WORLD_UP } from '../controls/planetMath'
import { groundAltitudeAt } from '../controls/terrain'
import { controlsRuntime } from '../controls/usePlanetController'
import { BlockyCharacter, type MotionState } from './BlockyCharacter'
import { mulberry32 } from './geometryUtils'
import { advanceNpc, type NpcState } from './npcWander'
import { usePlacementRuntime } from './placementRuntime'
import { PLANET_RADIUS, surfaceUnderfoot } from './planetConfig'

/**
 * A villager. Give it a placement id, a CharacterConfig and a behaviour,
 * and it stands (or ambles) on the island on the shared rig — the same
 * rig the player and Koa use, so head look-at, walk cycle and blob
 * shadow all come for free.
 *
 * It reads its placement LIVE, so the dev editor can drag it around and
 * the villager (and its home ground, if it wanders) follows on the drop.
 *
 * Nothing here re-renders React: the group's position and orientation
 * are written straight onto the object each frame from module scratch,
 * because a villager that walks would otherwise re-render the scene
 * sixty times a second.
 */

export type NpcBehavior = { kind: 'idle' } | { kind: 'wander'; radiusM: number; speedMps?: number }

/** Above this much water the ground is walkable — the villagers do not paddle. */
const DRY_ALT_M = 0.05
const DEFAULT_SPEED = 1.1
const PAUSE_MIN = 1.6
const PAUSE_MAX = 4.8
/** Beyond this arc the head goes neutral rather than tracking the player. */
const LOOK_RANGE_M = 9
/** Beyond this arc their footsteps are not worth a voice. */
const STEP_RANGE_M = 10

/** Deterministic per-villager seed, so a given villager always wanders
 *  the same way — a random seed makes a bug reproducible only by luck. */
function seedFrom(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function Npc({
  placementId,
  config,
  behavior,
}: {
  placementId: string
  config: CharacterConfig
  behavior: NpcBehavior
}) {
  // LIVE read: the editor moves this and the villager moves with it.
  const place = usePlacementRuntime((s) => s.list.find((p) => p.id === placementId))

  const group = useRef<THREE.Group>(null)

  const scratch = useMemo(
    () => ({
      unit: new THREE.Vector3(),
      north: new THREE.Vector3(),
      pole: new THREE.Vector3(),
      v: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      yawQ: new THREE.Quaternion(),
      invQ: new THREE.Quaternion(),
      home: { lat: 0, long: 0 },
      lastHome: null as { lat: number; long: number } | null,
      opts: {
        radiusM: 0,
        speedMps: DEFAULT_SPEED,
        pauseMin: PAUSE_MIN,
        pauseMax: PAUSE_MAX,
        rand: mulberry32(seedFrom(placementId)),
        walkable: (lat: number, long: number) => groundAltitudeAt(lat, long) > DRY_ALT_M,
      },
      /** Mutated in place and handed to the rig — never a new object. */
      motion: {
        locomotion: 'idle',
        airborne: false,
        azimuth: Math.PI,
        avatarYaw: 0,
        camPitch: 0,
      } as MotionState,
      arcToPlayer: 999,
    }),
    [placementId],
  )

  // Wander state starts AT the placement, facing the way it was authored.
  const npc = useMemo<NpcState>(() => {
    const lat = place?.lat ?? 0
    const long = place?.long ?? 0
    return {
      lat,
      long,
      // Sign note: the world consumes yawDeg as `rotation-y = meridianYaw
      // + yaw`, and in this right-handed frame with +Y up a POSITIVE
      // rotation about +Y swings local +Z toward WEST (signpost.ts found
      // the same thing the hard way). Headings here are the honest
      // north/east bearing, so the render negates them — which means the
      // authored yaw has to be negated coming in, or a villager would
      // spawn mirrored against every prop beside it.
      heading: -((place?.yawDeg ?? 0) * Math.PI) / 180,
      state: 'pause',
      timer: 0.4,
      target: null,
    }
    // Intentionally seeded once: later placement edits move the HOME (below),
    // they do not respawn the villager mid-stride.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placementId])

  const motionReader = useMemo(() => () => scratch.motion, [scratch])

  const onStep = useMemo(
    () => () => {
      // Footsteps from a villager across the island are noise; close up
      // they are the thing that makes it feel inhabited.
      if (scratch.arcToPlayer > STEP_RANGE_M) return
      stepSound(surfaceUnderfoot(90 - npc.lat, npc.long, false), false)
    },
    [scratch, npc],
  )

  useFrame((_state, rawDt) => {
    // Resumed tabs hand the whole hidden gap to the first frame.
    const dt = Math.min(rawDt, 0.1)
    const g = group.current
    if (!g || !place) return
    const s = scratch

    // Home follows the placement. An editor DRAG is a jump, so carry the
    // villager with it rather than letting it stroll back over ten
    // seconds while someone is trying to lay out a scene.
    s.home.lat = place.lat
    s.home.long = place.long
    if (s.lastHome === null) {
      s.lastHome = { lat: place.lat, long: place.long }
    } else if (s.lastHome.lat !== place.lat || s.lastHome.long !== place.long) {
      npc.lat += place.lat - s.lastHome.lat
      npc.long += place.long - s.lastHome.long
      npc.target = null
      s.lastHome.lat = place.lat
      s.lastHome.long = place.long
    }

    if (behavior.kind === 'wander') {
      s.opts.radiusM = behavior.radiusM
      s.opts.speedMps = behavior.speedMps ?? DEFAULT_SPEED
      advanceNpc(npc, dt, s.home, s.opts)
    }

    // ---- place the group on the sphere, allocation-free ---------------
    const polar = THREE.MathUtils.degToRad(90 - npc.lat)
    const lo = THREE.MathUtils.degToRad(npc.long)
    const sp = Math.sin(polar)
    const cp = Math.cos(polar)
    s.unit.set(sp * Math.sin(lo), cp, sp * Math.cos(lo))
    // Feet at rig-local y = 0 on the analytic ground — NO sink, or the
    // villager wades into the terrain the way the props deliberately do.
    const alt = groundAltitudeAt(npc.lat, npc.long)
    g.position.copy(s.unit).multiplyScalar(PLANET_RADIUS + alt)

    // SurfaceGroup's composition, inlined: surface normal up, then the
    // meridian correction so local +Z is north, then the facing.
    s.q.setFromUnitVectors(WORLD_UP, s.unit)
    s.north.set(-cp * Math.sin(lo), sp, -cp * Math.cos(lo))
    s.invQ.copy(s.q).invert()
    s.north.applyQuaternion(s.invQ)
    const meridian = Math.atan2(s.north.x, s.north.z)
    s.yawQ.setFromAxisAngle(WORLD_UP, meridian - npc.heading)
    g.quaternion.copy(s.q).multiply(s.yawQ)

    // ---- where is the player, from here? ------------------------------
    poleInPlanetSpace(controlsRuntime.planetQuaternion, s.pole)
    s.arcToPlayer = s.unit.angleTo(s.pole) * PLANET_RADIUS
    s.motion.locomotion = npc.state === 'walk' ? 'walk' : 'idle'
    if (s.arcToPlayer > LOOK_RANGE_M) {
      // avatarYaw + π: the rig reads azimuth − avatarYaw, and π is
      // "directly behind" — outside the look-at cone, so the head eases
      // back to neutral instead of snapping.
      s.motion.azimuth = s.motion.avatarYaw + Math.PI
    } else {
      // The player's planet-local position, brought into the villager's
      // OWN frame by the group quaternion we just built. Doing it this
      // way rather than by hand-rolled tangent bearings means the sign
      // cannot be wrong: atan2(x, z) in rig space is exactly what the
      // rig's look-at expects (the face is +Z), so a villager can never
      // end up politely turning its back on you.
      s.v.copy(s.pole).multiplyScalar(controlsRuntime.groundY).sub(g.position)
      s.invQ.copy(g.quaternion).invert()
      s.v.applyQuaternion(s.invQ)
      s.motion.azimuth = Math.atan2(s.v.x, s.v.z)
    }
  })

  if (!place) return null

  return (
    <group ref={group}>
      <BlockyCharacter config={config} motion={motionReader} onStep={onStep} />
      {/* Same blob shadow as the avatar (v3.4): polygon offset wins the
          depth fight with the terrain's jittered facets. No jump to
          follow, so it never shrinks. */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
        <circleGeometry args={[0.5 * (config.height / 1.25), 20]} />
        <meshBasicMaterial
          color="#14262b"
          transparent
          opacity={0.22}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
        />
      </mesh>
    </group>
  )
}
