import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import {
  GRASS_ALTITUDE,
  PLANET_RADIUS,
  SAND_ALTITUDE,
  SURF,
  TERRAIN,
} from './planetConfig'
import { skyRuntime } from './useSkyState'

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
        `uniform float uTime;\nvarying float vDepth;\nvarying float vWave;\nvarying vec3 vSphereDir;\n${consts}\n` +
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
          vWave = wave;
          vSphereDir = dir;`,
        )
      shader.fragmentShader =
        `varying float vDepth;\nvarying float vWave;\nvarying vec3 vSphereDir;\nuniform float uTime;\nuniform float uNightMix;\n` +
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

          // Glitter paths (v3.4): broken shimmer bands on the sea toward the
          // sun (warm, day) and moon (pale cool, night), riding the live
          // wave value so cells flicker as waves pass. No reflections.
          float gPolar = degrees(acos(clamp(vSphereDir.y, -1.0, 1.0)));
          vec2 gDirH = normalize(vSphereDir.xz + vec2(1e-6, 0.0));
          float gDist = (1.0 - smoothstep(80.0, 100.0, gPolar)) * smoothstep(74.5, 78.0, gPolar);
          // Two overlapping fine grids, soft threshold — small irregular
          // glints, not large hard angular patches (v3.5 soften).
          float gN1 = fract(sin(dot(floor(vSphereDir.xz * 420.0), vec2(12.9898, 78.233))) * 43758.5453 + vWave * 7.0);
          float gN2 = fract(sin(dot(floor(vSphereDir.xz * 730.0), vec2(39.3468, 11.135))) * 24634.6345 + vWave * 5.0);
          float gSparkle = smoothstep(0.55, 1.0, gN1 * 0.5 + gN2 * 0.5);
          float gSun = smoothstep(0.9976, 0.9998, gDirH.y);
          float gMoon = smoothstep(0.9976, 0.9998, -gDirH.y);
          float gDay = 1.0 - smoothstep(0.45, 0.7, uNightMix);
          float gNight = smoothstep(0.6, 0.85, uNightMix);
          vec3 glitter = vec3(1.0, 0.85, 0.63) * gSun * gDay + vec3(0.81, 0.88, 1.0) * gMoon * gNight;
          diffuseColor.rgb += glitter * gSparkle * gDist * 0.4;`,
        )
      mat.userData.shader = shader
    }
    return mat
  }, [])

  useFrame((state) => {
    const shader = waterMaterial.userData.shader as
      | { uniforms: { uTime: { value: number }; uNightMix: { value: number } } }
      | undefined
    if (shader) {
      shader.uniforms.uTime.value = state.clock.elapsedTime
      shader.uniforms.uNightMix.value = skyRuntime.nightMix
    }
  })

  return (
    <mesh material={waterMaterial} renderOrder={1}>
      <sphereGeometry args={[PLANET_RADIUS, 96, 48]} />
    </mesh>
  )
}
