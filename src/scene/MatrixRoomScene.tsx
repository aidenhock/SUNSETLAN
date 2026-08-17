import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../audio/procedural'
import { ATLAS_COLS, makeGlyphAtlas } from './matrixAtlas'

/**
 * The Matrix room's 3D half (TASK 4), code-split and mounted in the
 * MAIN canvas while `openModalId === 'matrix'` — never a second WebGL
 * context. The planet group is hidden meanwhile, so its draws drop to
 * ~0 and the whole room costs ~7 calls: black enclosure + floor disc
 * + THREE merged rain groups + portal frame (dark + green).
 *
 * Rain without shaders: each column is one tall quad whose UVs are
 * baked to a single atlas column strip (wrapT repeat, random phase);
 * columns share one of three materials whose `map.offset.y` scrolls
 * at that group's speed — the classic strip-scroll trick, three draw
 * calls total, zero per-frame allocations.
 */

const SPEEDS = [0.06, 0.11, 0.19] // uv units/s — slow read, fast blur tiers
const COL_H = 13
const V_REPEAT = 3

function buildRainGroup(rng: () => number, columns: number, radii: [number, number]): THREE.BufferGeometry {
  const quads: THREE.BufferGeometry[] = []
  for (let i = 0; i < columns; i++) {
    const az = rng() * Math.PI * 2
    const r = radii[0] + rng() * (radii[1] - radii[0])
    const g = new THREE.PlaneGeometry(0.55, COL_H).toNonIndexed()
    // Bake this quad's atlas column + phase into its UVs.
    const col = Math.floor(rng() * ATLAS_COLS)
    const phase = rng() * V_REPEAT
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let v = 0; v < uv.count; v++) {
      uv.setXY(v, (col + uv.getX(v)) / ATLAS_COLS, uv.getY(v) * V_REPEAT + phase)
    }
    // Far columns dim for depth (vertex color, still one material).
    const dim = 0.45 + (1 - (r - radii[0]) / (radii[1] - radii[0])) * 0.55
    const colors = new Float32Array(uv.count * 3)
    for (let v = 0; v < uv.count; v++) {
      colors[v * 3] = dim
      colors[v * 3 + 1] = dim
      colors[v * 3 + 2] = dim
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(Math.sin(az) * r, (rng() - 0.5) * 2, Math.cos(az) * r),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, az + Math.PI, 0)),
        new THREE.Vector3(1, 1, 1),
      ),
    )
    quads.push(g)
  }
  const merged = mergeGeometries(quads)!
  quads.forEach((q) => q.dispose())
  return merged
}

export function MatrixRoomScene() {
  const { camera } = useThree()
  const root = useRef<THREE.Group>(null)
  const rain = useRef<THREE.Group>(null)
  const glow = useRef<THREE.Mesh>(null)

  const { rainGeos, rainMats, portal } = useMemo(() => {
    const rng = mulberry32(0x3a7f1c)
    const atlas = makeGlyphAtlas(rng)
    const geos = SPEEDS.map(() => buildRainGroup(rng, 30, [8.5, 13]))
    const mats = SPEEDS.map(() => {
      const tex = atlas.clone()
      tex.needsUpdate = true
      return new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        vertexColors: true,
        fog: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      })
    })
    // Inner portal: chunky dark doorframe + glowing green edge — the
    // way back out. The DOM layer anchors its exit hint to this spot.
    const dark = new THREE.MeshBasicMaterial({ color: '#101218', fog: false, toneMapped: false })
    const green = new THREE.MeshBasicMaterial({ color: '#3aff7e', fog: false, toneMapped: false })
    const void_ = new THREE.MeshBasicMaterial({ color: '#03140b', fog: false, toneMapped: false })
    return { rainGeos: geos, rainMats: mats, portal: { dark, green, void_ } }
  }, [])

  useEffect(() => {
    // Park the room at the camera: position + yaw only, so the room is
    // level and straight ahead no matter where on the sphere you were.
    const g = root.current!
    g.position.copy(camera.position)
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
    g.rotation.set(0, e.y, 0)
    return () => {
      rainGeos.forEach((geo) => geo.dispose())
      rainMats.forEach((m) => {
        m.map?.dispose()
        m.dispose()
      })
      portal.dark.dispose()
      portal.green.dispose()
      portal.void_.dispose()
    }
  }, [camera, rainGeos, rainMats, portal])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    for (let i = 0; i < rainMats.length; i++) {
      const map = rainMats[i].map!
      map.offset.y += SPEEDS[i] * dt
      if (map.offset.y > 1) map.offset.y -= 1
    }
    if (rain.current) rain.current.rotation.y += dt * 0.02
    // The frame's glow flickers like a failing sign.
    if (glow.current) {
      const t = state.clock.elapsedTime
      const flicker = 0.75 + 0.25 * Math.sin(t * 9.1) * Math.sin(t * 3.7 + 1.3)
      ;(glow.current.material as THREE.MeshBasicMaterial).color.setRGB(
        0.23 * flicker,
        1.0 * flicker,
        0.49 * flicker,
      )
    }
  })

  return (
    <group ref={root}>
      {/* Black enclosure — covers whatever the sky hook paints. */}
      <mesh>
        <sphereGeometry args={[28, 16, 10]} />
        <meshBasicMaterial color="#020604" side={THREE.BackSide} fog={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, -1.7, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[14, 24]} />
        <meshBasicMaterial color="#03110a" fog={false} toneMapped={false} />
      </mesh>
      <group ref={rain}>
        {rainGeos.map((g, i) => (
          <mesh key={i} geometry={g} material={rainMats[i]} renderOrder={1} />
        ))}
      </group>
      {/* The inner portal, straight ahead: exit is E (the DOM layer). */}
      <group position={[0, -0.4, -6.5]}>
        <mesh material={portal.dark} position={[-1.05, 0.3, 0]}>
          <boxGeometry args={[0.35, 2.8, 0.35]} />
        </mesh>
        <mesh material={portal.dark} position={[1.05, 0.3, 0]}>
          <boxGeometry args={[0.35, 2.8, 0.35]} />
        </mesh>
        <mesh material={portal.dark} position={[0, 1.85, 0]}>
          <boxGeometry args={[2.6, 0.35, 0.35]} />
        </mesh>
        <mesh ref={glow} position={[0, 0.55, 0]}>
          <boxGeometry args={[1.78, 2.28, 0.06]} />
          <meshBasicMaterial color="#3aff7e" fog={false} toneMapped={false} />
        </mesh>
        <mesh material={portal.void_} position={[0, 0.55, 0.04]}>
          <boxGeometry args={[1.6, 2.1, 0.06]} />
        </mesh>
      </group>
    </group>
  )
}
