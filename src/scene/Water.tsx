import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { controlsRuntime } from '../controls/usePlanetController'
import {
  GRASS_ALTITUDE,
  PLANET_RADIUS,
  SAND_ALTITUDE,
  SURF,
  TERRAIN,
} from './planetConfig'
import { MOON_DISC_LOCAL, skyRuntime, SUN_DISC_LOCAL } from './useSkyState'

const _qInv = new THREE.Quaternion()

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
      // Camera position in the water's OBJECT space (the planet rotates, so
      // this is inverse-rotated per frame); the disc lights are planet-local
      // constants, so Blinn runs entirely in object space.
      shader.uniforms.uCamObj = { value: new THREE.Vector3(0, 60, 0) }
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
        `varying float vDepth;\nvarying vec3 vSphereDir;\nvarying vec3 vObjPos;\nuniform float uTime;\nuniform float uNightMix;\nuniform vec3 uCamObj;\n` +
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

          // v3.6 TRUE SPECULAR glitter (the deliberate water-only exception
          // to the matte rule): perturb the sphere normal analytically from
          // the same sine sum that displaces the vertices (derivatives are
          // cosines) plus normal-only micro-ripples for glint breakup, then
          // a Blinn term per light — all in object space (the disc lights
          // are planet-local constants; only the camera is inverse-rotated).
          // The lane lives between the VIEWER and the light: it travels with
          // the player and swings with the camera.
          float gPolar = degrees(acos(clamp(vSphereDir.y, -1.0, 1.0)));
          float gDist = (1.0 - smoothstep(80.0, 100.0, gPolar)) * smoothstep(74.5, 78.0, gPolar);
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
          vec3 V = normalize(uCamObj - vObjPos);
          vec3 Lsun = normalize(vec3(${SUN_DISC_LOCAL.x.toFixed(4)}, ${SUN_DISC_LOCAL.y.toFixed(4)}, ${SUN_DISC_LOCAL.z.toFixed(4)}) * 230.0 - vObjPos);
          vec3 Lmoon = normalize(vec3(${MOON_DISC_LOCAL.x.toFixed(4)}, ${MOON_DISC_LOCAL.y.toFixed(4)}, ${MOON_DISC_LOCAL.z.toFixed(4)}) * 230.0 - vObjPos);
          float sunGlint = smoothstep(0.05, 0.8, pow(max(dot(N, normalize(V + Lsun)), 0.0), 60.0));
          float moonGlint = smoothstep(0.05, 0.8, pow(max(dot(N, normalize(V + Lmoon)), 0.0), 60.0));
          float gDay = 1.0 - smoothstep(0.45, 0.7, uNightMix);
          float gNight = smoothstep(0.6, 0.85, uNightMix);
          diffuseColor.rgb += (vec3(1.0, 0.85, 0.63) * sunGlint * gDay
            + vec3(0.81, 0.88, 1.0) * moonGlint * gNight) * gDist * 0.7;`,
        )
      mat.userData.shader = shader
    }
    return mat
  }, [])

  const { camera } = useThree()

  useFrame((state) => {
    const shader = waterMaterial.userData.shader as
      | {
          uniforms: {
            uTime: { value: number }
            uNightMix: { value: number }
            uCamObj: { value: THREE.Vector3 }
          }
        }
      | undefined
    if (shader) {
      shader.uniforms.uTime.value = state.clock.elapsedTime
      shader.uniforms.uNightMix.value = skyRuntime.nightMix
      shader.uniforms.uCamObj.value
        .copy(camera.position)
        .applyQuaternion(_qInv.copy(controlsRuntime.planetQuaternion).invert())
    }
  })

  return (
    <mesh material={waterMaterial} renderOrder={1}>
      <sphereGeometry args={[PLANET_RADIUS, 96, 48]} />
    </mesh>
  )
}
