import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { meridianYaw, surfaceQuaternion } from '../controls/planetMath'
import type { InteractableDef, PropKind } from '../content/interactables'
import { useStore } from '../store/useStore'
import { buildBulletinBoard, buildEasel, buildHeadstone, buildHedgeStone, buildMicStand, buildTelescope, buildMailbox, buildMusicStereo, buildTripod, type PropPart } from './props'
import { DOME_R } from './CelestialDome'
import { buildRift } from './riftGeometry'
import { controlsRuntime } from '../controls/usePlanetController'
import { skyRuntime } from './useSkyState'

/** 'portal' is absent by design: the rift renders through RiftBody
 * with unlit materials, not the shared vertex-tinted prop pipeline. */
const PROP_BUILDERS: Record<Exclude<PropKind, 'portal' | 'telescope'>, () => PropPart[]> = {
  tripod: buildTripod,
  mailbox: buildMailbox,
  stereo: buildMusicStereo,
  hedgestone: buildHedgeStone,
  bulletin: buildBulletinBoard,
  headstone: buildHeadstone,
  easel: buildEasel,
  micstand: buildMicStand,
}

/**
 * An interactable, oriented to stand on the sphere with meridian-aligned yaw
 * (rotation[1] is relative to local north, like every SurfaceGroup prop).
 * Renders its chunky primitive prop when `prop` is set (see props.ts), else
 * the placeholder box. Proximity is angular distance, computed centrally in
 * usePlanetController — this component only renders and handles clicks/taps.
 */
export function Interactable({ def }: { def: InteractableDef }) {
  const isNearby = useStore((s) => s.nearbyId === def.id)
  const openModal = useStore((s) => s.openModal)

  const { quaternion, rotation, aimBasis } = useMemo(() => {
    const unit = new THREE.Vector3(...def.position).normalize()
    const lat = 90 - THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(unit.y, -1, 1)))
    const long = THREE.MathUtils.radToDeg(Math.atan2(unit.x, unit.z))
    const quaternion = surfaceQuaternion(unit)
    const rotation = new THREE.Euler(
      def.rotation[0],
      def.rotation[1] + meridianYaw(lat, long),
      def.rotation[2],
    )
    // Everything inside this prop sits under (surface × yaw). Inverting
    // that once gives a way to bring a PLANET-LOCAL direction — like the
    // moon's — into the prop's own frame, which is what lets the
    // telescope aim itself.
    const aimBasis = quaternion
      .clone()
      .multiply(new THREE.Quaternion().setFromEuler(rotation))
      .invert()
    return { quaternion, rotation, aimBasis }
  }, [def.position, def.rotation])

  const onClick = (e: { delta: number }) => {
    // While pointer-locked, clicks raycast from the stale pre-lock cursor
    // position — never open from those. Ignore orbit drags too.
    if (document.pointerLockElement) return
    // In the editor a click means "select this", not "open this".
    if (controlsRuntime.editing) return
    if (e.delta > 5) return
    document.body.style.cursor = 'auto'
    openModal(def.id)
  }
  const hover = {
    onPointerOver: () => (document.body.style.cursor = 'pointer'),
    onPointerOut: () => (document.body.style.cursor = 'auto'),
  }

  return (
    <group position={def.position} quaternion={quaternion}>
      <group rotation={rotation}>
        {def.prop === 'portal' ? (
          <RiftBody isNearby={isNearby} onClick={onClick} hover={hover} />
        ) : def.prop === 'telescope' ? (
          <TelescopeBody aimBasis={aimBasis} at={def.position} onClick={onClick} hover={hover} />
        ) : def.prop ? (
          <PropBody kind={def.prop} isNearby={isNearby} onClick={onClick} hover={hover} />
        ) : (
          <PlaceholderBody def={def} isNearby={isNearby} onClick={onClick} hover={hover} />
        )}
      </group>
    </group>
  )
}

/**
 * Placeholder cube in pastel lagoon (the old #1d6e73 read as a dark
 * off-palette slab). The Videos cube is the CRT stand-in: its screen glow
 * ramps with nightMix — pale blue emissive + a weak point light — so the
 * TV reads at night per the 3B spec.
 */
function PlaceholderBody({
  def,
  isNearby,
  onClick,
  hover,
}: {
  def: InteractableDef
  isNearby: boolean
  onClick: (e: { delta: number }) => void
  hover: { onPointerOver: () => void; onPointerOut: () => void }
}) {
  const matRef = useRef<THREE.MeshLambertMaterial>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const isTv = def.id === 'videos'

  useFrame(() => {
    if (!isTv) return
    const glow = skyRuntime.nightMix * 0.9
    const mat = matRef.current
    if (mat && !isNearby) {
      mat.emissive.setRGB(0.75 * glow, 0.88 * glow, 1.0 * glow)
      mat.emissiveIntensity = 1
    }
    const light = lightRef.current
    if (light) light.intensity = glow * 2.2
  })

  return (
    <mesh position={[0, 0.75, 0]} onClick={onClick} {...hover}>
      <boxGeometry args={[1.5, 1.5, 1.5]} />
      <meshLambertMaterial
        ref={matRef}
        color={isNearby ? '#5ecec7' : '#35a7a0'}
        emissive={isNearby ? '#5ecec7' : '#000000'}
        emissiveIntensity={isNearby ? 0.25 : 1}
        flatShading
      />
      {isTv && <pointLight ref={lightRef} position={[0, 0.3, 1.2]} distance={7} intensity={0} color="#bfe0ff" />}
    </mesh>
  )
}

/** Chunky prop body with a lagoon emissive pulse when the player is near. */
function PropBody({
  kind,
  isNearby,
  onClick,
  hover,
}: {
  kind: Exclude<PropKind, 'portal' | 'telescope'>
  isNearby: boolean
  onClick: (e: { delta: number }) => void
  hover: { onPointerOver: () => void; onPointerOut: () => void }
}) {
  // Clone the shared palette materials so the highlight never leaks into
  // other props using the same colors.
  const parts = useMemo(
    () =>
      PROP_BUILDERS[kind]().map((p) => ({
        ...p,
        material: p.material.clone(),
      })),
    [kind],
  )
  useEffect(() => {
    // Self-brighten, don't tint: each part's emissive is its OWN color,
    // so the highlight lifts the prop without a hue shift — a flat teal
    // emissive turned every shaded face grey-green (worst on dark wood,
    // where the tint was all you could see). Vertex-tinted parts carry
    // their color in the GEOMETRY (material.color is white — copying it
    // washed the merged uke to paper); those get a warm-wood lift.
    for (const p of parts) {
      // Glow parts (the portal's void pane) own their emissive — the
      // frame loop below ramps it with nightMix like the CRT.
      if (p.material.userData.glow) continue
      if (!isNearby) p.material.emissive.set('#000000')
      else if (p.material.vertexColors) p.material.emissive.set('#7a5f3d')
      else p.material.emissive.copy(p.material.color)
    }
  }, [parts, isNearby])
  // Night-scaled: after dark the same lift reads much stronger.
  useFrame(() => {
    const intensity = (isNearby ? 0.3 : 0) * (1 - 0.6 * skyRuntime.nightMix)
    const t = performance.now() / 1000
    for (const p of parts) {
      if (p.material.userData.glow) {
        // Failing-sign flicker, brighter after dark, lifted when near.
        const flick = 0.82 + 0.18 * Math.sin(t * 8.3) * Math.sin(t * 2.9 + 0.7)
        p.material.emissiveIntensity =
          (0.3 + 0.7 * skyRuntime.nightMix) * flick * (isNearby ? 1.25 : 1)
        continue
      }
      p.material.emissiveIntensity = intensity
    }
  })

  return (
    <>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={p.material} onClick={onClick} {...hover} />
      ))}
    </>
  )
}

/**
 * The rift: a hovering shard burst that spins slowly in its own plane,
 * bobs, and pulses. Its own component because `PropBody`'s self-brighten
 * highlight is meaningless here — the rift is already pure light, so
 * proximity widens it slightly instead.
 */
function RiftBody({
  isNearby,
  onClick,
  hover,
}: {
  isNearby: boolean
  onClick: (e: { delta: number }) => void
  hover: { onPointerOver: () => void; onPointerOut: () => void }
}) {
  const parts = useMemo(() => buildRift(), [])
  const spin = useRef<THREE.Group>(null)
  const scale = useRef(1)

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const t = state.clock.elapsedTime
    const g = spin.current
    if (!g) return
    g.rotation.z += dt * 0.11
    g.position.y = Math.sin(t * 0.7) * 0.09
    // Breathing scale, plus a small lean-in when the player is close.
    const target = (isNearby ? 1.1 : 1) * (1 + Math.sin(t * 1.9) * 0.025)
    scale.current += (target - scale.current) * Math.min(1, dt * 4)
    g.scale.setScalar(scale.current)
  })

  return (
    <group ref={spin} position={[0, 0, 0]}>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={p.material} onClick={onClick} {...hover} />
      ))}
    </group>
  )
}


/**
 * The telescope: a static tripod with a tube that FOLLOWS THE MOON.
 *
 * The moon on this planet is not a fixed prop in the sky — it rises and
 * sets with where you stand (the celestial arc), so a telescope aimed
 * at a hardcoded angle would be pointing at nothing most of the time.
 * `skyRuntime.moonLocal` carries its live direction in planet-local
 * space; `aimBasis` brings that into the prop's own frame, and the tube
 * turns to match, easing so it drifts rather than snapping.
 *
 * When the moon is below the horizon the tube returns to a resting tilt
 * instead of aiming into the ground.
 */
function TelescopeBody({
  aimBasis,
  at,
  onClick,
  hover,
}: {
  aimBasis: THREE.Quaternion
  /** The telescope's own planet-local position. */
  at: [number, number, number]
  onClick: (e: { delta: number }) => void
  hover: { onPointerOver: () => void; onPointerOut: () => void }
}) {
  const here = useMemo(() => new THREE.Vector3(...at), [at])
  const parts = useMemo(() => buildTelescope(), [])
  const tube = useRef<THREE.Group>(null)
  const aim = useRef(new THREE.Quaternion())
  const rest = useMemo(
    // Parked: tilted up and a little back, the way one is left standing.
    () => new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.6, 0, 0)),
    [],
  )

  useFrame((_state, rawDt) => {
    const g = tube.current
    if (!g) return
    const dt = Math.min(rawDt, 0.1)
    // Above the horizon? Then track it; otherwise ease back to rest.
    const up = skyRuntime.moonElevAboveLimbDeg > 1
    if (up) {
      // Aim from WHERE THE TELESCOPE STANDS, not from the planet's
      // centre: the moon sits on a dome of radius 240 around a world of
      // radius 55, so a surface observer sees it up to ~13° away from
      // its centre-of-planet direction — the whole difference between
      // pointing at the horizon and pointing at the sky above it.
      _dir
        .copy(skyRuntime.moonLocal)
        .multiplyScalar(DOME_R)
        .sub(here)
        .normalize()
        .applyQuaternion(aimBasis)
      _target.setFromUnitVectors(_UP, _dir)
    } else {
      _target.copy(rest)
    }
    // ~0.8 s ease: the moon crawls, and a snapping tube looks mechanical.
    aim.current.slerp(_target, 1 - Math.exp(-dt / 0.8))
    g.quaternion.copy(aim.current)
  })

  return (
    <group onClick={onClick} {...hover}>
      <mesh geometry={parts[0].geometry} material={parts[0].material} />
      <group ref={tube} position={[0, TELESCOPE_PIVOT_Y, 0]}>
        <mesh geometry={parts[1].geometry} material={parts[1].material} />
      </group>
    </group>
  )
}

/** Height of the yoke the tube swings on (matches buildTelescope). */
const TELESCOPE_PIVOT_Y = 1.21
const _dir = new THREE.Vector3()
const _target = new THREE.Quaternion()
const _UP = new THREE.Vector3(0, 1, 0)
