import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useStore } from '../store/useStore'
import { mulberry32 } from './geometryUtils'
import { SKY, skyRuntime } from './useSkyState'

/**
 * The two skies, v3.7. The dome is one ShaderMaterial with three layers:
 * an elevation-only blue base, a RADIAL warm glow centered on the sun disc
 * (plus a horizon band only when the sun is low), and a tighter radial
 * silver-blue moon glow — all keyed off the DYNAMIC disc dirs, so the
 * glows ride the celestial arc automatically. The sky renders UNMAPPED
 * (no tone mapping; every sky material sets toneMapped:false): the ACES
 * tone mapper was the diagnosed white-out source — it bleached the
 * saturated gold/pink regions. A minimum-saturation clamp guards every
 * fragment on top. Elevation is computed from the CAMERA (the player's
 * horizon sits far above the dome equator). All sky materials are
 * fog-excluded, depth-write-off, rendered first.
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
uniform vec3 uSunWorld;  // unit, from planet center — DYNAMIC (arc)
uniform vec3 uMoonWorld; // unit, from planet center — DYNAMIC (arc)
uniform vec3 uDayZen; uniform vec3 uDayMid; uniform vec3 uDayHor; uniform vec3 uAntiHaze;
uniform vec3 uNightH; uniform vec3 uNightL; uniform vec3 uNightM; uniform vec3 uNightZ;
uniform vec3 uSunsetDeep; uniform vec3 uSunsetGold; uniform vec3 uSunsetPink; uniform vec3 uBridge;
uniform vec3 uMoonLayer; uniform vec3 uWayfind;
varying vec3 vWorldPos;

vec3 stops4(vec3 h, vec3 l, vec3 m, vec3 z, float e) {
  vec3 c = mix(h, l, smoothstep(0.0, 0.16, e));
  c = mix(c, m, smoothstep(0.14, 0.42, e));
  return mix(c, z, smoothstep(0.38, 0.75, e));
}

void main() {
  vec3 vd = normalize(vWorldPos - cameraPosition); // view direction
  float elev = vd.y;                               // player-relative elevation

  // Base layer: a genuinely BLUE day ramp; night keeps blue→black.
  vec3 dayBase = mix(uDayHor, uDayMid, smoothstep(-0.05, 0.22, elev));
  dayBase = mix(dayBase, uDayZen, smoothstep(0.2, 0.55, elev));
  vec3 nightBase = stops4(uNightH, uNightL, uNightM, uNightZ, elev);
  vec3 col = mix(dayBase, nightBase, uNightMix);

  float dayGate = 1.0 - smoothstep(0.55, 0.85, uNightMix);
  float nightGate = smoothstep(0.6, 0.85, uNightMix);

  // Sun glow (v3.7): RADIAL around the disc — centered at every elevation,
  // strongest at the disc, warm at every radius, gone by ~40°.
  vec3 sunFromCam = normalize(uSunWorld * ${BODY_R.toFixed(1)} - cameraPosition);
  float sunAng = acos(clamp(dot(vd, sunFromCam), -1.0, 1.0));
  float radial = (1.0 - smoothstep(0.0, 0.7, sunAng)) * dayGate;
  vec3 warm = mix(uSunsetPink, uSunsetDeep, smoothstep(0.25, 0.75, radial));
  warm = mix(warm, uSunsetGold, smoothstep(0.8, 0.97, radial));
  float rt = smoothstep(0.04, 0.55, radial);
  col = mix(mix(col, uBridge, clamp(rt * 2.0, 0.0, 1.0)), warm, clamp(rt * 2.0 - 1.0, 0.0, 1.0));

  // Horizon-hugging warm band ONLY when the sun is low (< ~18°): beach
  // sunsets paint the horizon; a high sun has no orphaned band below it.
  float sunLow = 1.0 - smoothstep(0.17, 0.31, sunFromCam.y);
  vec2 sunH = normalize(sunFromCam.xz + vec2(1e-5, 0.0));
  vec2 dirH = normalize(vd.xz + vec2(1e-5, 0.0));
  float azBand = smoothstep(0.34, 0.9, dot(sunH, dirH));
  float band = sunLow * azBand * (1.0 - smoothstep(-0.02, 0.30, elev))
    * smoothstep(-0.35, -0.06, elev) * dayGate;
  col = mix(col, mix(uSunsetDeep, uBridge, 0.35), band * 0.6);

  // Anti-sun day horizon: slightly deeper soft blue haze (evening air).
  float azDist = acos(clamp(dot(sunH, dirH), -1.0, 1.0));
  float elevFall = 1.0 - smoothstep(-0.05, 0.55, elev);
  float antiW = smoothstep(1.5708, 3.1416, azDist) * elevFall * dayGate;
  col = mix(col, uAntiHaze, antiW * 0.45);

  // Moon glow (v3.7): radial, cool silver-blue, tighter (~25°), disc
  // centered, night-gated — no dome-wash.
  vec3 moonFromCam = normalize(uMoonWorld * ${BODY_R.toFixed(1)} - cameraPosition);
  float moonAng = acos(clamp(dot(vd, moonFromCam), -1.0, 1.0));
  float mRadial = (1.0 - smoothstep(0.0, 0.44, moonAng)) * nightGate;
  col = mix(col, uMoonLayer, mRadial * 0.55);

  // Deep-night wayfinding: faint steel-blue toward the DAY azimuth only.
  float wf = smoothstep(0.55, 0.92, dot(sunH, dirH))
    * (1.0 - smoothstep(0.10, 0.30, elev)) * smoothstep(-0.35, -0.06, elev)
    * smoothstep(0.78, 0.92, uNightMix);
  col = mix(col, uWayfind, wf * 0.55);

  // Minimum-saturation clamp (raised in v3.8): outside the discs no sky
  // fragment may trend bright-gray/white — pull offenders to palette blue.
  float maxC = max(col.r, max(col.g, col.b));
  float sat = (maxC - min(col.r, min(col.g, col.b))) / max(maxC, 1e-4);
  float grayish = (1.0 - smoothstep(0.18, 0.30, sat)) * smoothstep(0.5, 0.7, maxC);
  col = mix(col, mix(uDayMid, uNightH, uNightMix) * maxC, grayish * 0.6);

  // Screen-space hash dither (~±1/255): shallow gradients band on 8-bit
  // displays even when the math is smooth.
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 127.5;

  // v3.7: NO tone mapping — the sky tokens are WYSIWYG (ACES was the
  // diagnosed white-out source). Output color space conversion only.
  gl_FragColor = vec4(col, 1.0);
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
      uSunWorld: { value: skyRuntime.sunLocal.clone() },
      uMoonWorld: { value: skyRuntime.moonLocal.clone() },
      uDayZen: { value: new THREE.Color(SKY.dayZenith) },
      uDayMid: { value: new THREE.Color(SKY.dayMid) },
      uDayHor: { value: new THREE.Color(SKY.dayHorizon) },
      uAntiHaze: { value: new THREE.Color(SKY.antiHaze) },
      uNightH: { value: new THREE.Color(SKY.nightHorizon) },
      uNightL: { value: new THREE.Color(SKY.nightLow) },
      uNightM: { value: new THREE.Color(SKY.nightMid) },
      uNightZ: { value: new THREE.Color(SKY.nightZenith) },
      uSunsetDeep: { value: new THREE.Color(SKY.sunsetDeep) },
      uSunsetGold: { value: new THREE.Color(SKY.sunsetGold) },
      uSunsetPink: { value: new THREE.Color(SKY.sunsetPink) },
      uBridge: { value: new THREE.Color(SKY.sunsetBridge) },
      uMoonLayer: { value: new THREE.Color(SKY.moonLayer) },
      uWayfind: { value: new THREE.Color(SKY.wayfind) },
    },
  })
}

/** Seeded star positions on the night dome region; two size batches for
 * the spec's slight size variance. */
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

const starMaterial = (size: number) =>
  new THREE.PointsMaterial({
    color: '#fff3d6', // starlight token
    size,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    fog: false,
    depthWrite: false,
    toneMapped: false,
  })

/** Maria blotches: flat circles merged per gray — subtle, within the disc
 * (r 11), so the moon still reads as glowing. */
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

const _z = new THREE.Vector3(0, 0, 1)
const _negDir = new THREE.Vector3()

export function CelestialDome() {
  const qualityTier = useStore((s) => s.qualityTier)
  const domeMaterial = useMemo(buildDomeMaterial, [])
  const [starsSmall, starsBig] = useMemo(
    () => buildStars(qualityTier === 'low' ? 150 : 400),
    [qualityTier],
  )
  const starMatSmall = useMemo(() => starMaterial(1.7), [])
  const starMatBig = useMemo(() => starMaterial(2.8), [])
  const sunGroup = useRef<THREE.Group>(null)
  const moonGroup = useRef<THREE.Group>(null)
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

    // Disc groups ride the celestial arc (planet-local, per frame).
    const sg = sunGroup.current
    if (sg) {
      sg.position.copy(skyRuntime.sunLocal).multiplyScalar(BODY_R)
      sg.quaternion.setFromUnitVectors(_z, _negDir.copy(skyRuntime.sunLocal).negate())
    }
    const mg = moonGroup.current
    if (mg) {
      mg.position.copy(skyRuntime.moonLocal).multiplyScalar(BODY_R)
      mg.quaternion.setFromUnitVectors(_z, _negDir.copy(skyRuntime.moonLocal).negate())
    }

    // Stars fade in across nightMix 0.55 → 0.9.
    const fade = THREE.MathUtils.smoothstep(nightMix, 0.55, 0.9)
    starMatSmall.opacity = 0.85 * fade
    starMatBig.opacity = 0.95 * fade
    // Side gating: sun stages gone by nightMix ~0.6; moon a faint ghost in
    // residual daylight, full past 0.75.
    const dayGate = 1 - THREE.MathUtils.smoothstep(nightMix, 0.35, 0.6)
    if (sunOuterMat.current) sunOuterMat.current.opacity = 0.22 * dayGate
    if (sunInnerMat.current) sunInnerMat.current.opacity = 0.5 * dayGate
    if (sunCoreMat.current) sunCoreMat.current.opacity = dayGate
    if (sg) sg.visible = dayGate > 0.01
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

      {/* Sun: bright core + two glow stages, all warm-tinted and unmapped;
          the group rides the celestial arc per frame. */}
      <group ref={sunGroup}>
        <mesh renderOrder={-9}>
          <circleGeometry args={[34, 28]} />
          <meshBasicMaterial
            ref={sunOuterMat}
            color="#ff9e5e"
            transparent
            opacity={0.22}
            fog={false}
            depthWrite={false}
            toneMapped={false}
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
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 0, 0.8]} renderOrder={-8}>
          <circleGeometry args={[14, 26]} />
          <meshBasicMaterial
            ref={sunCoreMat}
            color="#ffe9b4"
            transparent
            fog={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* Moon: full disc + maria, unmapped; rides the arc per frame. */}
      <group ref={moonGroup}>
        <mesh renderOrder={-8}>
          <circleGeometry args={[11, 24]} />
          <meshBasicMaterial
            ref={moonMat}
            color="#f4ecd8"
            transparent
            opacity={0.22}
            fog={false}
            depthWrite={false}
            toneMapped={false}
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
            toneMapped={false}
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
            toneMapped={false}
          />
        </mesh>
      </group>
    </>
  )
}
