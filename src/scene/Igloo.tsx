import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { placement } from '../content/placements'
import { usePlacementRuntime } from './placementRuntime'
import { IGLOO_ARCH_STRETCH, IGLOO_MOUTH, SNOW_COLORS } from './props'
import { skyRuntime } from './useSkyState'
import { SurfaceGroup } from './SurfaceGroup'

/**
 * Warmth at the igloo's door (Antarctica life). The dome itself is a
 * plain instanced prop; this is the glue that makes it look lived in —
 * one dim warm point light at the mouth, night-gated exactly the way
 * the memorial garden's lanterns are, and a faint emissive disc set
 * into the tunnel's dark opening so the entrance glows from inside.
 *
 * Both hang off `IGLOO_MOUTH`, the same constants `buildIgloo` cuts the
 * tunnel from, so the light can never end up glowing through a wall.
 * The placement is read LIVE, so dragging the igloo in the dev editor
 * carries its doorway light with it.
 */
export function Igloo() {
  const home = usePlacementRuntime((s) => s.list.find((p) => p.id === 'igloo')) ?? placement('igloo')
  const light = useRef<THREE.PointLight>(null)
  const glow = useRef<THREE.MeshLambertMaterial>(null)

  // A small half disc standing on the tunnel floor, a hair in front of
  // the prop's dark opening: the merge owns the HOLE, this owns the pool
  // of light at the bottom of it. Sized to a bit over half the opening —
  // at full width it covered the dark disc completely and the entrance
  // read as a flat orange plate, a garage door rather than a doorway.
  // DERIVED from IGLOO_MOUTH (0.6 of it, stretched on the arch's own
  // ratio) so the home-sized doorway keeps the same read it had at
  // crawl-tunnel size instead of a 0.4 m puddle in a 1.7 m arch.
  const mouthGeo = useMemo(() => {
    const g = new THREE.CircleGeometry(IGLOO_MOUTH.radius * 0.6, 12, 0, Math.PI)
    g.scale(1, IGLOO_ARCH_STRETCH, 1)
    return g
  }, [])

  useFrame(() => {
    // Polar night is permanent down here, but the same gate the cemetery
    // uses keeps this honest if the lighting model ever changes.
    const night = THREE.MathUtils.smoothstep(skyRuntime.nightMix, 0.45, 0.8)
    if (light.current) light.current.intensity = 1.6 * night
    if (glow.current) glow.current.emissiveIntensity = 0.6 * night
  })

  return (
    <SurfaceGroup lat={home.lat} long={home.long} yaw={(home.yawDeg * Math.PI) / 180}>
      <mesh geometry={mouthGeo} position={[0, 0.02, IGLOO_MOUTH.z - 0.03]}>
        <meshLambertMaterial
          ref={glow}
          color={SNOW_COLORS.opening}
          emissive="#ff9a55"
          emissiveIntensity={0.6}
          flatShading
        />
      </mesh>
      {/* The lamp is INSIDE the tunnel, not on the step. Hung outside it
          sat a hand's width from the opening disc and blew it out to a
          flat orange plate — a fire door, not a doorway. Behind the disc
          it lights nothing but the tunnel walls and the snow the mouth
          spills onto, which is what "warm inside" actually looks like. */}
      <pointLight
        ref={light}
        position={[0, IGLOO_MOUTH.y + 0.15, IGLOO_MOUTH.z - IGLOO_MOUTH.length * 0.45]}
        distance={9}
        decay={1.2}
        color="#ffb070"
        intensity={1.6}
      />
    </SurfaceGroup>
  )
}
