import { useMemo } from 'react'
import * as THREE from 'three'
import { useStore } from '../store/useStore'
import { mulberry32 } from './geometryUtils'
import { MOON_LOCAL, SKY, SUN_LOCAL } from './useSkyState'

/**
 * The two permanent skies (CLAUDE.md 3B). Everything here is a child of the
 * rotating planet group, so the warm sky is welded to long 0 and the night
 * sky to long 180: walk toward the sunset side and the sun rises ahead of
 * you. All materials are fog-excluded and depth-write-off (scene fog 60–220
 * would otherwise swallow the dome at radius 240), and render first.
 */

const DOME_R = 240 // inside camera far 400
const BODY_R = 230 // sun/moon/stars sit just inside the dome

const WARM_HORIZON = new THREE.Color('#FFB870')
const WARM_HIGH = new THREE.Color('#FFC98B')
const NIGHT = new THREE.Color(SKY.fogNight) // #1B2033 midnight
const NIGHT_ZENITH = new THREE.Color('#141a2b')

/** Faces +Z toward the planet center from a local anchor direction. */
function facingCenter(unit: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    unit.clone().negate(),
  )
}

function buildDome(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(DOME_R, 48, 32)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const v = new THREE.Vector3()
  const warm = new THREE.Color()
  const night = new THREE.Color()
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize()
    // Blend by ANGULAR DISTANCE from the sun anchor, not longitude — a
    // longitude blend makes the night side a thin pole-to-pole lune that
    // pinches overhead; this makes it a proper cap around the antisolar
    // point. 83° → 120° puts the terminator gradient over the spawn zenith
    // (both moods visible from the pole — the signature).
    const sunAngle = v.angleTo(SUN_LOCAL)
    const e = THREE.MathUtils.smoothstep(v.y, -0.05, 0.5)
    warm.lerpColors(WARM_HORIZON, WARM_HIGH, e)
    night.lerpColors(NIGHT, NIGHT_ZENITH, e)
    c.lerpColors(warm, night, THREE.MathUtils.smoothstep(sunAngle, 1.45, 2.1))
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

/** Stars scattered only on the night hemisphere of the dome, seeded. */
function buildStars(count: number): THREE.BufferGeometry {
  const rand = mulberry32(2033)
  const positions = new Float32Array(count * 3)
  const v = new THREE.Vector3()
  let placed = 0
  while (placed < count) {
    v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1)
    if (v.lengthSq() > 1 || v.lengthSq() < 1e-4) continue
    v.normalize()
    // Night side only (local −z beyond the terminator). Allow well below the
    // dome equator: from the night beach the visible sky band over the sea
    // is at negative local y.
    if (v.z > -0.25 || v.y < -0.6) continue
    positions[placed * 3] = v.x * (BODY_R + 4)
    positions[placed * 3 + 1] = v.y * (BODY_R + 4)
    positions[placed * 3 + 2] = v.z * (BODY_R + 4)
    placed++
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return geo
}

export function CelestialDome() {
  const qualityTier = useStore((s) => s.qualityTier)
  const domeGeo = useMemo(buildDome, [])
  const starGeo = useMemo(() => buildStars(qualityTier === 'low' ? 150 : 400), [qualityTier])
  const sunPos = useMemo(() => SUN_LOCAL.clone().multiplyScalar(BODY_R), [])
  const sunQ = useMemo(() => facingCenter(SUN_LOCAL), [])
  const moonPos = useMemo(() => MOON_LOCAL.clone().multiplyScalar(BODY_R), [])
  const moonQ = useMemo(() => facingCenter(MOON_LOCAL), [])

  return (
    <>
      <mesh geometry={domeGeo} renderOrder={-10}>
        <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} />
      </mesh>

      <points geometry={starGeo} renderOrder={-9}>
        <pointsMaterial
          color="#fff3d6" // starlight token
          size={2}
          sizeAttenuation={false}
          transparent
          opacity={0.9}
          fog={false}
          depthWrite={false}
        />
      </points>

      {/* Sun: soft halo behind a warm disc, low over the long-0 water. */}
      <group position={sunPos} quaternion={sunQ}>
        <mesh renderOrder={-9}>
          <circleGeometry args={[24, 24]} />
          <meshBasicMaterial
            color="#ffd9a0"
            transparent
            opacity={0.35}
            fog={false}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, 0, 0.5]} renderOrder={-8}>
          <circleGeometry args={[15, 24]} />
          <meshBasicMaterial color="#ffe9b4" fog={false} depthWrite={false} />
        </mesh>
      </group>

      {/* Moon: pale disc + offset sky-colored disc carving the crescent. */}
      <group position={moonPos} quaternion={moonQ}>
        <mesh renderOrder={-8}>
          <circleGeometry args={[11, 24]} />
          <meshBasicMaterial color="#f4ecd8" fog={false} depthWrite={false} />
        </mesh>
        <mesh position={[4.2, 1.4, 0.5]} renderOrder={-7}>
          <circleGeometry args={[10.2, 24]} />
          <meshBasicMaterial color={NIGHT} fog={false} depthWrite={false} />
        </mesh>
      </group>
    </>
  )
}
