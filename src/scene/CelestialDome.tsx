import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useStore } from '../store/useStore'
import { mulberry32 } from './geometryUtils'
import { MOON_DISC_LOCAL, SKY, skyRuntime, SUN_DISC_LOCAL } from './useSkyState'

/**
 * The two skies, v3.2 (CLAUDE.md). The dome is one small ShaderMaterial:
 * 3-stop vertical gradients (horizon/mid/zenith) per state blended
 * stop-by-stop by nightMix, plus a horizon-band sun halo hard-gated to zero
 * past nightMix 0.85, a pale cool moon glow (night-gated), and the faint
 * steel-blue deep-night wayfinding band toward the day azimuth. Elevation is
 * computed from the CAMERA (view direction), not dome-local y — the player
 * stands at radius ~57, so their perceived horizon is nowhere near the
 * dome's equator. Sun/moon discs and stars stay planet-local children; all
 * sky materials are fog-excluded, depth-write-off, rendered first.
 */

const DOME_R = 240 // inside camera far 400
const BODY_R = 230 // sun/moon/stars sit just inside the dome

const DOME_VERT = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const DOME_FRAG = /* glsl */ `
uniform float uNightMix;
uniform vec3 uSunWorld;  // unit, from planet center
uniform vec3 uMoonWorld; // unit, from planet center
uniform vec3 uDayH; uniform vec3 uDayL; uniform vec3 uDayM; uniform vec3 uDayZ;
uniform vec3 uNightH; uniform vec3 uNightL; uniform vec3 uNightM; uniform vec3 uNightZ;
uniform vec3 uHalo; uniform vec3 uMoonGlow; uniform vec3 uWayfind;
varying vec3 vWorldPos;

vec3 stops4(vec3 h, vec3 l, vec3 m, vec3 z, float e) {
  vec3 c = mix(h, l, smoothstep(0.0, 0.16, e));
  c = mix(c, m, smoothstep(0.14, 0.42, e));
  return mix(c, z, smoothstep(0.38, 0.75, e));
}

void main() {
  vec3 vd = normalize(vWorldPos - cameraPosition); // view direction
  float elev = vd.y;                               // player-relative elevation
  vec3 col = mix(
    stops4(uDayH, uDayL, uDayM, uDayZ, elev),
    stops4(uNightH, uNightL, uNightM, uNightZ, elev),
    uNightMix
  );

  // Azimuth proximity to the sun, in the player's horizontal plane.
  vec3 sunFromCam = normalize(uSunWorld * ${BODY_R.toFixed(1)} - cameraPosition);
  vec2 sunH = normalize(sunFromCam.xz + vec2(1e-5, 0.0));
  vec2 dirH = normalize(vd.xz + vec2(1e-5, 0.0));
  float azCos = dot(sunH, dirH);
  float horizonBand = (1.0 - smoothstep(0.10, 0.42, elev)) * smoothstep(-0.35, -0.06, elev);

  // Sun halo: horizon band, ~±40° of the sun azimuth, ZERO past nightMix 0.85.
  float halo = smoothstep(0.766, 0.96, azCos) * horizonBand
    * (1.0 - smoothstep(0.45, 0.85, uNightMix));
  col += uHalo * halo * 0.55;

  // Moon glow (v3.3): tighter than the sun's, cool blue-white, and only
  // past residual daylight — the moon must never read as a second sun.
  vec3 moonFromCam = normalize(uMoonWorld * ${BODY_R.toFixed(1)} - cameraPosition);
  float mg = smoothstep(0.94, 0.995, dot(vd, moonFromCam)) * smoothstep(0.6, 0.85, uNightMix);
  col += uMoonGlow * mg * 0.5;

  // Deep-night wayfinding: faint steel-blue toward the DAY azimuth only.
  float wf = smoothstep(0.55, 0.92, azCos)
    * (1.0 - smoothstep(0.10, 0.30, elev)) * smoothstep(-0.35, -0.06, elev)
    * smoothstep(0.78, 0.92, uNightMix);
  col = mix(col, uWayfind, wf * 0.55);

  // Screen-space hash dither (~±1/255): shallow gradients band on 8-bit
  // displays even when the math is smooth — the standard zero-cost fix.
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 127.5;

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function buildDomeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: DOME_VERT,
    fragmentShader: DOME_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uNightMix: { value: 0 },
      uSunWorld: { value: SUN_DISC_LOCAL.clone() },
      uMoonWorld: { value: MOON_DISC_LOCAL.clone() },
      uDayH: { value: new THREE.Color(SKY.dayHorizon) },
      uDayL: { value: new THREE.Color(SKY.dayLow) },
      uDayM: { value: new THREE.Color(SKY.dayMid) },
      uDayZ: { value: new THREE.Color(SKY.dayZenith) },
      uNightH: { value: new THREE.Color(SKY.nightHorizon) },
      uNightL: { value: new THREE.Color(SKY.nightLow) },
      uNightM: { value: new THREE.Color(SKY.nightMid) },
      uNightZ: { value: new THREE.Color(SKY.nightZenith) },
      uHalo: { value: new THREE.Color(SKY.dayHorizon) },
      uMoonGlow: { value: new THREE.Color('#9fb4d8') },
      uWayfind: { value: new THREE.Color(SKY.wayfind) },
    },
  })
}

/** Faces +Z toward the planet center from a local anchor direction. */
function facingCenter(unit: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    unit.clone().negate(),
  )
}

/** Seeded star positions on the night dome region; split into two size
 * batches for the spec's slight size variance. */
function buildStars(count: number): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const rand = mulberry32(2033)
  const points: number[] = []
  let placed = 0
  const v = new THREE.Vector3()
  while (placed < count) {
    v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1)
    if (v.lengthSq() > 1 || v.lengthSq() < 1e-4) continue
    v.normalize()
    if (v.z > -0.25 || v.y < -0.6) continue
    points.push(v.x * (BODY_R + 4), v.y * (BODY_R + 4), v.z * (BODY_R + 4))
    placed++
  }
  const split = Math.floor(count * 0.7) * 3
  const geoOf = (arr: number[]) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3))
    return g
  }
  return [geoOf(points.slice(0, split)), geoOf(points.slice(split))]
}

/** Maria blotches (v3.4): flat circles merged per gray — subtle, within the
 * disc (r 11), so the moon still reads as glowing. */
const mariaCircle = (r: number, x: number, y: number) =>
  new THREE.CircleGeometry(r, 14).applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, 0))
const mariaGeoA = mergeGeometries([
  mariaCircle(3.1, -2.6, 2.2),
  mariaCircle(2.2, 2.8, 0.6),
  mariaCircle(1.6, -0.6, -3.4),
])
const mariaGeoB = mergeGeometries([
  mariaCircle(1.9, 1.4, 3.9),
  mariaCircle(1.4, -4.3, -1.6),
  mariaCircle(1.1, 3.4, -3.0),
])

const starMaterial = (size: number) =>
  new THREE.PointsMaterial({
    color: '#fff3d6', // starlight token
    size,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    fog: false,
    depthWrite: false,
  })

export function CelestialDome() {
  const qualityTier = useStore((s) => s.qualityTier)
  const domeMaterial = useMemo(buildDomeMaterial, [])
  const [starsSmall, starsBig] = useMemo(
    () => buildStars(qualityTier === 'low' ? 150 : 400),
    [qualityTier],
  )
  const starMatSmall = useMemo(() => starMaterial(1.7), [])
  const starMatBig = useMemo(() => starMaterial(2.8), [])
  const sunPos = useMemo(() => SUN_DISC_LOCAL.clone().multiplyScalar(BODY_R), [])
  const sunQ = useMemo(() => facingCenter(SUN_DISC_LOCAL), [])
  const moonPos = useMemo(() => MOON_DISC_LOCAL.clone().multiplyScalar(BODY_R), [])
  const moonQ = useMemo(() => facingCenter(MOON_DISC_LOCAL), [])
  const sunGroup = useRef<THREE.Group>(null)
  const sunOuterMat = useRef<THREE.MeshBasicMaterial>(null)
  const sunInnerMat = useRef<THREE.MeshBasicMaterial>(null)
  const sunCoreMat = useRef<THREE.MeshBasicMaterial>(null)
  const moonMat = useRef<THREE.MeshBasicMaterial>(null)
  const mariaMatA = useRef<THREE.MeshBasicMaterial>(null)
  const mariaMatB = useRef<THREE.MeshBasicMaterial>(null)

  useFrame(() => {
    const u = domeMaterial.uniforms
    const nightMix = skyRuntime.nightMix
    u.uNightMix.value = nightMix
    ;(u.uSunWorld.value as THREE.Vector3).copy(skyRuntime.sunWorld)
    ;(u.uMoonWorld.value as THREE.Vector3).copy(skyRuntime.moonWorld)
    // Stars fade in across nightMix 0.55 → 0.9 (spec v3.2).
    const fade = THREE.MathUtils.smoothstep(nightMix, 0.55, 0.9)
    starMatSmall.opacity = 0.85 * fade
    starMatBig.opacity = 0.95 * fade
    // v3.3 side gating: sun stages are gone by nightMix ~0.6; the moon is a
    // faint daytime ghost that only reaches full brightness past 0.75.
    const dayGate = 1 - THREE.MathUtils.smoothstep(nightMix, 0.35, 0.6)
    if (sunOuterMat.current) sunOuterMat.current.opacity = 0.22 * dayGate
    if (sunInnerMat.current) sunInnerMat.current.opacity = 0.5 * dayGate
    if (sunCoreMat.current) sunCoreMat.current.opacity = dayGate
    const g = sunGroup.current
    if (g) g.visible = dayGate > 0.01
    const moonOpacity = THREE.MathUtils.lerp(
      0.22,
      1,
      THREE.MathUtils.smoothstep(nightMix, 0.5, 0.75),
    )
    if (moonMat.current) moonMat.current.opacity = moonOpacity
    if (mariaMatA.current) mariaMatA.current.opacity = 0.8 * moonOpacity
    if (mariaMatB.current) mariaMatB.current.opacity = 0.7 * moonOpacity
  })

  return (
    <>
      <mesh material={domeMaterial} renderOrder={-10}>
        <sphereGeometry args={[DOME_R, 48, 32]} />
      </mesh>

      <points geometry={starsSmall} material={starMatSmall} renderOrder={-9} />
      <points geometry={starsBig} material={starMatBig} renderOrder={-9} />

      {/* Sun (v3.4): bright near-white core with a two-stage glow — tight
          warm inner, wide soft outer. All stages fade by nightMix ~0.6. */}
      <group ref={sunGroup} position={sunPos} quaternion={sunQ}>
        <mesh renderOrder={-9}>
          <circleGeometry args={[34, 28]} />
          <meshBasicMaterial
            ref={sunOuterMat}
            color="#ff9e5e"
            transparent
            opacity={0.22}
            fog={false}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, 0, 0.4]} renderOrder={-8}>
          <circleGeometry args={[19, 26]} />
          <meshBasicMaterial
            ref={sunInnerMat}
            color="#ffb36b"
            transparent
            opacity={0.5}
            fog={false}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, 0, 0.8]} renderOrder={-8}>
          <circleGeometry args={[14, 26]} />
          <meshBasicMaterial
            ref={sunCoreMat}
            color="#fff3d9"
            transparent
            fog={false}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Moon: full disc over the night sea — a pale ghost in residual
          daylight, full past nightMix ~0.75 — with flat maria blotches in
          two darker grays (v3.4; meshes, not textures). Its tight cool
          glow lives in the dome shader. */}
      <group position={moonPos} quaternion={moonQ}>
        <mesh renderOrder={-8}>
          <circleGeometry args={[11, 24]} />
          <meshBasicMaterial
            ref={moonMat}
            color="#f4ecd8"
            transparent
            opacity={0.22}
            fog={false}
            depthWrite={false}
          />
        </mesh>
        <mesh geometry={mariaGeoA} position={[0, 0, 0.3]} renderOrder={-7}>
          <meshBasicMaterial
            ref={mariaMatA}
            color="#ddd3bd"
            transparent
            opacity={0}
            fog={false}
            depthWrite={false}
          />
        </mesh>
        <mesh geometry={mariaGeoB} position={[0, 0, 0.4]} renderOrder={-7}>
          <meshBasicMaterial
            ref={mariaMatB}
            color="#cbc0a9"
            transparent
            opacity={0}
            fog={false}
            depthWrite={false}
          />
        </mesh>
      </group>
    </>
  )
}
