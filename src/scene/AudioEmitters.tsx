import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { audioRuntime, onArmed, play2d, playAt, routeToBus } from '../audio/core'
import { CrossfadeLoop } from '../audio/loops'
import { latLongToUnit, poleInPlanetSpace } from '../controls/planetMath'
import { controlsRuntime } from '../controls/usePlanetController'
import { useStore } from '../store/useStore'
import { MAP, PLANET_RADIUS } from './planetConfig'
import { gullAnchors } from './Seagulls'
import { SurfaceGroup } from './SurfaceGroup'
import { skyRuntime } from './useSkyState'

/**
 * 3C proximity emitters + mixing (CLAUDE.md Audio system). All lazy
 * via onArmed; every gain moves through ~0.5 s lerps; everything sits
 * under the master (mute wins instantly).
 *
 * <WorldEmitters/> (INSIDE the planet group): campfire crackle —
 * positional crossfade loop from the fire pool, night-scaled like the
 * flicker — and gull cries whose PositionalAudio parents onto an
 * actual orbiting gull, bag-timed, day side only.
 *
 * useMusicMix() (camera-side): lofi/pad loop on the music bus with the
 * uke crossfade rule, campfire duck, and modal duck; the shore
 * proximity waves bed (2D crossfade loop on the world bus); the UI
 * blip on modal open/close.
 */

const LERP_TAU = 0.5
const _gullPos = new THREE.Vector3()
const _avatarPos = new THREE.Vector3()

/** The music bus target — pure, vitest-covered: base × uke crossfade
 * (inside 8 m the uke owns the soundscape) × campfire duck (0.6 inside
 * 10 → 4 m) × modal duck (to 0.2). */
export function musicTarget(arcUkeM: number, arcFireM: number, modalOpen: boolean): number {
  const ukeF = THREE.MathUtils.smoothstep(arcUkeM, 8, 20)
  const fireF = THREE.MathUtils.lerp(0.6, 1, THREE.MathUtils.smoothstep(arcFireM, 4, 10))
  return 0.35 * ukeF * fireF * (modalOpen ? 0.57 : 1)
}

/** Campfire crackle level — PURE proximity (audio finishing pass):
 * full at 3 m, silent past 12 m, and deliberately no nightMix term —
 * day/night has nothing to do with what a fire sounds like. */
export function crackleTarget(arcFireM: number): number {
  return 0.7 * (1 - THREE.MathUtils.smoothstep(arcFireM, 3, 12))
}

/** Gull cry launch gain (polish pass 2): a real gradient on top of the
 * panner — swells toward 8 m, gone past 30 m, so flyovers breathe. */
export function cryGain(distM: number): number {
  return 0.6 * (1 - THREE.MathUtils.smoothstep(distM, 8, 30))
}

export function WorldEmitters() {
  const fireAnchor = useRef<THREE.Group>(null)
  const st = useRef({
    fire: new CrossfadeLoop('campfire', 0.6),
    fireNode: null as THREE.PositionalAudio | null,
    cryNode: null as THREE.PositionalAudio | null,
    nextCry: 0,
    fireUnit: latLongToUnit(MAP.campfire.lat, MAP.campfire.long),
    pole: new THREE.Vector3(),
  })

  useMemo(() => {
    onArmed(() => {
      const rt = audioRuntime
      const g = fireAnchor.current
      if (!rt.listener || !rt.ctx || !g) return
      const fireNode = new THREE.PositionalAudio(rt.listener)
      fireNode.setRefDistance(3)
      fireNode.setDistanceModel('exponential')
      fireNode.setRolloffFactor(1.6)
      g.add(fireNode)
      routeToBus(fireNode, 'world')
      st.current.fireNode = fireNode
      const cry = new THREE.PositionalAudio(rt.listener)
      cry.setRefDistance(3)
      cry.setDistanceModel('exponential')
      cry.setRolloffFactor(1.8)
      routeToBus(cry, 'world')
      st.current.cryNode = cry
      st.current.nextCry = rt.ctx.currentTime + 5
    })
  }, [])

  useFrame((_, dt) => {
    const rt = audioRuntime
    if (!rt.ctx) return
    const s = st.current
    if (s.fireNode) {
      s.fire.update(s.fireNode.panner)
      const lvl = s.fire.level(s.fireNode.panner)
      if (lvl) {
        poleInPlanetSpace(controlsRuntime.planetQuaternion, s.pole)
        const arcFire = s.pole.angleTo(s.fireUnit) * PLANET_RADIUS
        const target = crackleTarget(arcFire)
        lvl.gain.value += (target - lvl.gain.value) * (1 - Math.exp(-dt / LERP_TAU))
        ;(window as unknown as { __fireLevel?: number }).__fireLevel = lvl.gain.value
      }
    }
    if (s.cryNode && rt.ctx.currentTime >= s.nextCry && skyRuntime.nightMix < 0.5) {
      const anchors = gullAnchors.filter((a): a is THREE.Group => !!a)
      const anchor = anchors[Math.floor(Math.random() * anchors.length)]
      if (anchor) {
        anchor.add(s.cryNode)
        // Launch gain shaped by the distance to THAT gull at cry time
        // (3D distance — the gull is airborne), on top of the panner.
        anchor.getWorldPosition(_gullPos)
        _avatarPos.set(0, controlsRuntime.groundY + 1.2, 0)
        const g = cryGain(_gullPos.distanceTo(_avatarPos))
        ;(window as unknown as { __lastCryGain?: number }).__lastCryGain = g
        if (g > 0.01) void playAt('seagulls', s.cryNode, g)
      }
      s.nextCry = rt.ctx.currentTime + 6 + Math.random() * 10
    }
  })

  return (
    <SurfaceGroup lat={MAP.campfire.lat} long={MAP.campfire.long}>
      <group ref={fireAnchor} position={[0, 0.4, 0]} />
    </SurfaceGroup>
  )
}

export function useMusicMix() {
  const st = useRef({
    started: false,
    waves: new CrossfadeLoop('waves', 0.5),
    ukeUnit: latLongToUnit(MAP.ukulelePlayer.lat, MAP.ukulelePlayer.long),
    fireUnit: latLongToUnit(MAP.campfire.lat, MAP.campfire.long),
    pole: new THREE.Vector3(),
  })

  // UI blip on modal open AND close.
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (s.openModalId !== prev.openModalId) void play2d('ui', 'ui', 0.45)
      }),
    [],
  )

  useFrame((_, dt) => {
    const rt = audioRuntime
    if (!rt.armed || !rt.ctx || !rt.buses) return
    const s = st.current
    if (!s.started) {
      // Lofi file if present (CREDITS-gated), else the generative pad.
      s.started = true
      void import('../audio/core').then(({ nextBuffer }) =>
        nextBuffer('music').then((buffer) => {
          if (!buffer || !rt.ctx || !rt.buses) return
          const src = rt.ctx.createBufferSource()
          src.buffer = buffer
          src.loop = true
          src.connect(rt.buses.music)
          src.start()
        }),
      )
    }
    const k = 1 - Math.exp(-dt / LERP_TAU)
    // musicGain = base × smoothstep(8, 20, arcTo(uke)) × campfire duck
    // × modal duck — inside 8 m the uke owns the soundscape.
    poleInPlanetSpace(controlsRuntime.planetQuaternion, s.pole)
    const arcUke = s.pole.angleTo(s.ukeUnit) * PLANET_RADIUS
    const arcFire = s.pole.angleTo(s.fireUnit) * PLANET_RADIUS
    const target = musicTarget(arcUke, arcFire, useStore.getState().openModalId !== null)
    rt.buses.music.gain.value += (target - rt.buses.music.gain.value) * k
    // Waves bed: shore-proximity level over the crossfading bag picks.
    s.waves.update(rt.buses.world)
    const lvl = s.waves.level(rt.buses.world)
    if (lvl) {
      const wavesTarget = 0.45 * THREE.MathUtils.smoothstep(controlsRuntime.surfPolarDeg, 58, 73)
      lvl.gain.value += (wavesTarget - lvl.gain.value) * k
    }
  })
}
