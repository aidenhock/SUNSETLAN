import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { controlsRuntime } from '../controls/usePlanetController'
import {
  GLITTER,
  GRASS_ALTITUDE,
  laneParams,
  PLANET_RADIUS,
  SAND_ALTITUDE,
  SURF,
  TERRAIN,
} from './planetConfig'
import { MOON_DISC_ANG_RAD_DEG, skyRuntime, SUN_DISC_ANG_RAD_DEG } from './useSkyState'

const _qInv = new THREE.Quaternion()
const _eye = new THREE.Vector3()
const _eyeUp = new THREE.Vector3()
const _n = new THREE.Vector3()
const _fwd = new THREE.Vector3()
/** Avatar eye height above its ground point (m) — the lane's viewer term
 * is the CHARACTER's eye, not the camera (v3.13 stylization). */
const EYE_HEIGHT = 1.35
const SUN_RHO = THREE.MathUtils.degToRad(SUN_DISC_ANG_RAD_DEG)
const MOON_RHO = THREE.MathUtils.degToRad(MOON_DISC_ANG_RAD_DEG)

/**
 * Sphere-wrapping ocean with cheap vertex waves plus the v3.3 surf-foam
 * system, all in one Lambert onBeforeCompile:
 * - 2–3 summed sines displace along the normal in object space (planet-local
 *   — waves rotate with the world), plus a slow shore-weighted surf cycle
 *   (SURF in planetConfig, also read by the wade ripple) that advances and
 *   recedes the waterline up the sand.
 * - The vertex shader evaluates terrainProfile (same control points, ported
 *   to GLSL) and passes water depth; the fragment paints a white foam band
 *   where the LIVE displaced surface meets the beach, with a noise-broken
 *   leading edge. Computed from the displaced surface, foam can never
 *   detach or gap — the old separate foam ring mesh is gone.
 */
export function Water() {
  const waterMaterial = useMemo(() => {
    const mat = new THREE.MeshLambertMaterial({
      color: '#35a7a0',
      flatShading: true,
      transparent: true,
      opacity: 0.92,
    })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 }
      shader.uniforms.uNightMix = { value: 0 }
      // The AVATAR EYE in the water's OBJECT space (the planet rotates, so
      // this is inverse-rotated per frame) — v3.13: the lane's viewer term
      // is the character, never the camera; orbiting changes your view OF
      // the lane, not the lane. The disc positions are also object-space
      // uniforms (v3.7 — they ride the celestial arc), so Blinn runs
      // entirely in object space and the lanes track the discs.
      shader.uniforms.uEyeObj = { value: new THREE.Vector3(0, 57, 0) }
      shader.uniforms.uSunObj = { value: skyRuntime.sunLocal.clone().multiplyScalar(230) }
      shader.uniforms.uMoonObj = { value: skyRuntime.moonLocal.clone().multiplyScalar(230) }
      // v3.14 per body: corridor half-widths in perpendicular arc METERS
      // (x = far end at the disc base, y = held at the shoreline), the
      // centerline great-circle plane normal, the horizontal forward dir
      // (hemisphere gate), and lane opacity (height-eased to the floor ×
      // the submergence gate).
      shader.uniforms.uSunHalf = { value: new THREE.Vector2(0.5, 1.5) }
      shader.uniforms.uMoonHalf = { value: new THREE.Vector2(0.4, 1.1) }
      shader.uniforms.uSunN = { value: new THREE.Vector3(1, 0, 0) }
      shader.uniforms.uMoonN = { value: new THREE.Vector3(1, 0, 0) }
      shader.uniforms.uSunFwd = { value: new THREE.Vector3(0, 0, 1) }
      shader.uniforms.uMoonFwd = { value: new THREE.Vector3(0, 0, -1) }
      shader.uniforms.uSunLane = { value: 0.95 }
      shader.uniforms.uMoonLane = { value: 0.95 }
      const consts = /* glsl */ `
        const float PLATEAU_END = ${TERRAIN.plateauEndDeg.toFixed(1)};
        const float SHOULDER_END = ${TERRAIN.shoulderEndDeg.toFixed(1)};
        const float WATERLINE = ${TERRAIN.waterlineDeg.toFixed(1)};
        const float APRON_END = ${TERRAIN.apronEndDeg.toFixed(1)};
        const float GRASS_ALT = ${GRASS_ALTITUDE.toFixed(3)};
        const float SAND_ALT = ${SAND_ALTITUDE.toFixed(3)};
        const float APRON_ALT = ${TERRAIN.apronAltitude.toFixed(3)};
        const float SURF_PERIOD = ${SURF.periodS.toFixed(2)};
        const float SURF_AMP = ${SURF.amplitudeM.toFixed(3)};
        const float SURF_START = ${SURF.startDeg.toFixed(1)};
        const float SURF_END = ${SURF.endDeg.toFixed(1)};
        float profileAlt(float pDeg) {
          if (pDeg <= PLATEAU_END) return GRASS_ALT;
          if (pDeg <= SHOULDER_END) return mix(GRASS_ALT, SAND_ALT, smoothstep(PLATEAU_END, SHOULDER_END, pDeg));
          if (pDeg <= WATERLINE) return mix(SAND_ALT, 0.0, smoothstep(SHOULDER_END, WATERLINE, pDeg));
          if (pDeg <= APRON_END) return mix(0.0, APRON_ALT, smoothstep(WATERLINE, APRON_END, pDeg));
          return APRON_ALT;
        }
      `
      shader.vertexShader =
        `uniform float uTime;\nvarying float vDepth;\nvarying vec3 vSphereDir;\nvarying vec3 vObjPos;\n${consts}\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          vec3 dir = normalize(position);
          float polarDeg = degrees(acos(clamp(dir.y, -1.0, 1.0)));
          float wave =
            (sin(position.x * 0.35 + uTime * 1.1) +
             sin(position.z * 0.28 - uTime * 0.9) +
             sin((position.x + position.y) * 0.22 + uTime * 0.6)) * 0.04;
          // Slow surf cycle, shore-weighted — the waterline itself breathes.
          wave += sin(uTime * 6.2831853 / SURF_PERIOD) * SURF_AMP * smoothstep(SURF_START, SURF_END, polarDeg);
          transformed += dir * wave;
          vDepth = wave - profileAlt(polarDeg);
          vSphereDir = dir;
          vObjPos = position;`,
        )
      shader.fragmentShader =
        `varying float vDepth;\nvarying vec3 vSphereDir;\nvarying vec3 vObjPos;\nuniform float uTime;\nuniform float uNightMix;\nuniform vec3 uEyeObj;\nuniform vec3 uSunObj;\nuniform vec3 uMoonObj;\nuniform vec2 uSunHalf;\nuniform vec2 uMoonHalf;\nuniform vec3 uSunN;\nuniform vec3 uMoonN;\nuniform vec3 uSunFwd;\nuniform vec3 uMoonFwd;\nuniform float uSunLane;\nuniform float uMoonLane;\n` +
        shader.fragmentShader.replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          /* glsl */ `
          // Foam: white band where the live surface meets the beach, with a
          // coherent noisy leading edge (never a perfect circle).
          float ang = atan(vSphereDir.x, vSphereDir.z);
          float edgeNoise = 0.5 + 0.25 * sin(ang * 23.0 + uTime * 0.6) + 0.25 * sin(ang * 57.0 - uTime * 0.9);
          // Narrow band (~0.09–0.2 m of depth) with a sharpened profile —
          // a crisp surf line, not a mist over the shallows.
          float bandWidth = 0.16 * (0.55 + 0.9 * edgeNoise);
          float foam = smoothstep(0.3, 0.8, 1.0 - smoothstep(0.0, bandWidth, vDepth));
          // Only where water actually covers terrain (depth > 0-ish).
          foam *= smoothstep(-0.04, 0.01, vDepth);
          vec4 diffuseColor = vec4(mix(diffuse, vec3(1.0), foam * 0.9), mix(opacity, 0.97, foam));

          // v3.14 CHARACTER-ANCHORED specular glitter (the deliberate
          // water-only exception to the matte rule): perturb the sphere
          // normal analytically from the same sine sum that displaces the
          // vertices (derivatives are cosines) plus normal-only
          // micro-ripples for glint breakup, then a Blinn term per light —
          // all in object space. The viewer term is the AVATAR EYE, so the
          // lane always runs body → character; the camera only looks at it.
          // Shore end: fade into the foam band by LIVE water depth — the
          // lane reaches the wet sand edge whether standing or wading (a
          // polar gate cuts it short of the waterline: banned).
          float gShore = smoothstep(0.02, 0.14, vDepth);
          vec3 sphereN = normalize(vSphereDir);
          float wa1 = vObjPos.x * 0.35 + uTime * 1.1;
          float wa2 = vObjPos.z * 0.28 - uTime * 0.9;
          float wa3 = (vObjPos.x + vObjPos.y) * 0.22 + uTime * 0.6;
          float wm1 = vObjPos.x * 2.1 + vObjPos.z * 1.7 + uTime * 2.3;
          float wm2 = -vObjPos.x * 1.4 + vObjPos.z * 2.6 + uTime * 1.9;
          vec3 grad = vec3(
            (0.35 * cos(wa1) + 0.22 * cos(wa3)) * 0.04 + (2.1 * cos(wm1) - 1.4 * cos(wm2)) * 0.005,
            0.22 * cos(wa3) * 0.04,
            0.28 * cos(wa2) * 0.04 + (1.7 * cos(wm1) + 2.6 * cos(wm2)) * 0.005
          );
          vec3 tGrad = grad - sphereN * dot(grad, sphereN);
          vec3 N = normalize(sphereN - tGrad * 5.0);
          vec3 V = normalize(uEyeObj - vObjPos);
          vec3 Lsun = normalize(uSunObj - vObjPos);
          vec3 Lmoon = normalize(uMoonObj - vObjPos);
          // v3.14 corridor: the centerline is the great circle through the
          // avatar and the body (plane normal uSunN/uMoonN); half-width is
          // perpendicular arc METERS. An azimuth cone from the eye pinches
          // to a point at the viewer's nadir — the corridor holds its near
          // width all the way to the shore instead. The corridor is a
          // STENCIL: the animated glints render inside it; it only clamps
          // the footprint, and its edges carry a small time-varying wobble
          // (amplitude ≪ the far→near width step, so no waist).
          vec3 eyeUp = normalize(uEyeObj);
          vec3 fragDir = normalize(vObjPos - uEyeObj);
          float fragElev = asin(clamp(dot(fragDir, eyeUp), -1.0, 1.0));
          // 0 at the near water underfoot → 1 at the ocean limb. The limb
          // sits at -0.21..-0.25 rad from the eye (shore vs inland), so
          // the -0.22 edge converges the corridor to its far width AT it.
          float tFar = smoothstep(-0.9, -0.22, fragElev);
          vec3 Fn = normalize(vObjPos);
          vec3 R = reflect(-V, N);
          float along = fragElev * 40.0;
          // Anti-branch gate: the corridor plane's far branch (open sea
          // pointing AWAY from the body) is cut, but water within a few
          // meters of the eye always passes — the wading strip behind the
          // character must stay lit so the lane reaches the sand.
          float eyeDist = length(vObjPos - uEyeObj);
          float nearEye = 1.0 - smoothstep(6.0, 10.0, eyeDist);

          float sideSun = dot(Fn, uSunN);
          float perpSun = abs(sideSun) * ${PLANET_RADIUS.toFixed(1)};
          float wobSun = 1.0 + ${GLITTER.wobbleAmp.toFixed(2)} *
            (0.6 * sin(along * 1.9 + uTime * 1.3 + sign(sideSun) * 1.7)
             + 0.4 * sin(along * 4.3 - uTime * 0.8));
          // Far endpoint is ANGULAR × the fragment's eye distance: from an
          // inland vantage the visible sea sits far past the tangent limb,
          // and a fixed-meter far width would shrink the lane to a thread.
          float halfWSun = mix(uSunHalf.y, uSunHalf.x * eyeDist, tFar) * wobSun;
          float wedgeSun = (1.0 - smoothstep(halfWSun * 0.7, halfWSun, perpSun))
            * max(smoothstep(0.02, 0.15, dot(fragDir, uSunFwd)), nearEye);
          float aSun = max(0.0, acos(clamp(dot(R, Lsun), -1.0, 1.0)) - ${SUN_RHO.toFixed(4)});
          // Stencil fill: a low wave-breathing base keeps the corridor
          // coherent; sharp glints from the perturbed normals dance on it.
          float glintSun = smoothstep(0.08, 0.7, pow(max(cos(aSun), 0.0), 20.0));
          float shimmerSun = 0.18 + 0.10 * (0.5 + 0.5 * sin(wa1 + wa2)) + 0.72 * glintSun;

          float sideMoon = dot(Fn, uMoonN);
          float perpMoon = abs(sideMoon) * ${PLANET_RADIUS.toFixed(1)};
          float wobMoon = 1.0 + ${GLITTER.wobbleAmp.toFixed(2)} *
            (0.6 * sin(along * 1.9 + uTime * 1.3 + sign(sideMoon) * 1.7)
             + 0.4 * sin(along * 4.3 - uTime * 0.8));
          float halfWMoon = mix(uMoonHalf.y, uMoonHalf.x * eyeDist, tFar) * wobMoon;
          float wedgeMoon = (1.0 - smoothstep(halfWMoon * 0.7, halfWMoon, perpMoon))
            * max(smoothstep(0.02, 0.15, dot(fragDir, uMoonFwd)), nearEye);
          float aMoon = max(0.0, acos(clamp(dot(R, Lmoon), -1.0, 1.0)) - ${MOON_RHO.toFixed(4)});
          float glintMoon = smoothstep(0.08, 0.7, pow(max(cos(aMoon), 0.0), 20.0));
          float shimmerMoon = 0.18 + 0.10 * (0.5 + 0.5 * sin(wa1 + wa2)) + 0.72 * glintMoon;

          // Gates match each DISC's own fade exactly (sun 0.35–0.6, moon
          // 0.5–0.75) — the lane disappears in lockstep with its body.
          float gDay = 1.0 - smoothstep(0.35, 0.6, uNightMix);
          float gNight = smoothstep(0.5, 0.75, uNightMix);
          diffuseColor.rgb += (vec3(1.0, 0.85, 0.63) * wedgeSun * shimmerSun * gDay * uSunLane
            + vec3(0.81, 0.88, 1.0) * wedgeMoon * shimmerMoon * gNight * uMoonLane) * gShore;
          // Far water goes opaque (v3.12): the translucent sheet let the
          // bright dome glow bleed through below the limb, reading as a
          // ghost band under the horizon.
          diffuseColor.a = max(diffuseColor.a, mix(diffuseColor.a, 0.985, smoothstep(0.5, 0.9, tFar)));`,
        )
      mat.userData.shader = shader
    }
    return mat
  }, [])

  useFrame((state) => {
    const shader = waterMaterial.userData.shader as
      | {
          uniforms: {
            uTime: { value: number }
            uNightMix: { value: number }
            uEyeObj: { value: THREE.Vector3 }
            uSunObj: { value: THREE.Vector3 }
            uMoonObj: { value: THREE.Vector3 }
            uSunHalf: { value: THREE.Vector2 }
            uMoonHalf: { value: THREE.Vector2 }
            uSunN: { value: THREE.Vector3 }
            uMoonN: { value: THREE.Vector3 }
            uSunFwd: { value: THREE.Vector3 }
            uMoonFwd: { value: THREE.Vector3 }
            uSunLane: { value: number }
            uMoonLane: { value: number }
          }
        }
      | undefined
    if (shader) {
      shader.uniforms.uTime.value = state.clock.elapsedTime
      shader.uniforms.uNightMix.value = skyRuntime.nightMix
      // The avatar eye is world-fixed above the pole; jump excluded so the
      // lane never bobs.
      shader.uniforms.uEyeObj.value
        .copy(_eye.set(0, controlsRuntime.groundY + EYE_HEIGHT, 0))
        .applyQuaternion(_qInv.copy(controlsRuntime.planetQuaternion).invert())
      ;(shader.uniforms.uSunObj.value as THREE.Vector3)
        .copy(skyRuntime.sunLocal)
        .multiplyScalar(230)
      ;(shader.uniforms.uMoonObj.value as THREE.Vector3)
        .copy(skyRuntime.moonLocal)
        .multiplyScalar(230)
      // v3.14 corridor frame data: the centerline great-circle plane per
      // body (through the avatar and the body) and the horizontal forward
      // dir for the hemisphere gate.
      const eyeUp = _eyeUp.copy(shader.uniforms.uEyeObj.value).normalize()
      shader.uniforms.uSunN.value
        .copy(_n.crossVectors(eyeUp, skyRuntime.sunLocal))
        .normalize()
      shader.uniforms.uSunFwd.value
        .copy(_fwd.copy(skyRuntime.sunLocal).addScaledVector(eyeUp, -skyRuntime.sunLocal.dot(eyeUp)))
        .normalize()
      shader.uniforms.uMoonN.value
        .copy(_n.crossVectors(eyeUp, skyRuntime.moonLocal))
        .normalize()
      shader.uniforms.uMoonFwd.value
        .copy(_fwd.copy(skyRuntime.moonLocal).addScaledVector(eyeUp, -skyRuntime.moonLocal.dot(eyeUp)))
        .normalize()
      // Bounded height mapping (v3.13, approved): rising widens the
      // corridor and fades opacity to its floor; submergence is the only
      // kill.
      const sun = laneParams(
        skyRuntime.sunElevAboveLimbDeg,
        SUN_RHO,
        skyRuntime.sunVisibleFrac,
      )
      const moon = laneParams(
        skyRuntime.moonElevAboveLimbDeg,
        MOON_RHO,
        skyRuntime.moonVisibleFrac,
      )
      shader.uniforms.uSunHalf.value.set(sun.halfFarRad, sun.halfNearM)
      shader.uniforms.uMoonHalf.value.set(moon.halfFarRad, moon.halfNearM)
      shader.uniforms.uSunLane.value = sun.opacity
      shader.uniforms.uMoonLane.value = moon.opacity
    }
  })

  return (
    <mesh material={waterMaterial} renderOrder={1}>
      <sphereGeometry args={[PLANET_RADIUS, 96, 48]} />
    </mesh>
  )
}
