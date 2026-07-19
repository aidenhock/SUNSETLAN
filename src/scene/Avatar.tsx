import { useAnimations, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { controlsRuntime } from '../controls/usePlanetController'
import { DRACO_PATH } from './instancing'

const HEIGHT_M = 1.65
const FADE_S = 0.15
const _m = new THREE.Matrix4()
const _discardScale = new THREE.Vector3()

/**
 * Palette-cell recolor: Quaternius characters share one tiny palette texture,
 * so "recolor the materials" means remapping cells. Tolerant nearest-match
 * because the webp palette smears cell borders. [from, to] in sRGB hex.
 */
const RECOLOR: [string, string][] = [
  ['#42361c', '#e8c36a'], // hair → blonde
  ['#412817', '#d4a94f'], // hair shading → darker blonde
  ['#65593f', '#35a7a0'], // jacket/shirt → lagoon (casual tee)
  ['#524830', '#2c8f89'], // shirt shading → lagoon shade
  ['#4e4528', '#2c8f89'],
  ['#4d4628', '#2c8f89'],
  ['#4d4531', '#8a7a63'], // pants → warm khaki
]
const TOLERANCE = 12 // adventurer palette cells sit close together

function recolorPalette(scene: THREE.Group) {
  const materials: THREE.MeshStandardMaterial[] = []
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) materials.push(mesh.material as THREE.MeshStandardMaterial)
  })
  const material = materials[0]
  const map = material?.map
  const image = map?.image as HTMLImageElement | ImageBitmap | undefined
  if (!material || !map || !image) return
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.drawImage(image, 0, 0)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  // Compare and write raw sRGB bytes — THREE.Color would convert hex to the
  // linear working space and never match the canvas pixels.
  const hexToRgb = (h: string) =>
    [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as const
  const pairs = RECOLOR.map(([f, t]) => ({ from: hexToRgb(f), to: hexToRgb(t) }))
  const d = data.data
  let hits = 0
  const sampled = new Map<string, number>()
  for (let i = 0; i < d.length; i += 4) {
    const hex = `#${[d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`
    sampled.set(hex, (sampled.get(hex) ?? 0) + 1)
    for (const { from, to } of pairs) {
      const dr = d[i] - from[0]
      const dg = d[i + 1] - from[1]
      const db = d[i + 2] - from[2]
      if (dr * dr + dg * dg + db * db < TOLERANCE * TOLERANCE) {
        d[i] = to[0]
        d[i + 1] = to[1]
        d[i + 2] = to[2]
        hits++
        break
      }
    }
  }
  ctx.putImageData(data, 0, 0)
  if (new URLSearchParams(window.location.search).has('e2e')) {
    ;(window as unknown as { __recolorDebug?: unknown }).__recolorDebug = {
      width: canvas.width,
      height: canvas.height,
      hits,
      top: [...sampled.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    }
  }
  const next = new THREE.CanvasTexture(canvas)
  next.flipY = map.flipY // glTF textures use flipY=false; keep it
  next.colorSpace = map.colorSpace
  next.needsUpdate = true
  for (const m of materials) {
    m.map = next
    m.flatShading = true
    m.roughness = 1
    m.metalness = 0
    m.needsUpdate = true
  }
}

/** Lens-less glasses: two thin rims + a bridge, following the head bone. */
function buildGlasses(): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: '#14262b', flatShading: true })
  const rimGeo = new THREE.TorusGeometry(0.038, 0.008, 6, 14)
  for (const x of [-0.048, 0.048]) {
    const rim = new THREE.Mesh(rimGeo, mat)
    rim.position.set(x, 0, 0)
    g.add(rim)
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.01, 0.01), mat)
  g.add(bridge)
  return g
}

/**
 * Aiden: Quaternius animated low-poly character (CC0), palette recolored in
 * code, glasses on the head bone. Clips follow the controller: idle / walk /
 * run / jump with short crossfades. The outer group is driven by the planet
 * controller (position.y + facing); this component only animates the body.
 */
export const Avatar = forwardRef<THREE.Group>(function Avatar(_, ref) {
  const { scene, animations } = useGLTF('/models/avatar.glb', DRACO_PATH)
  const inner = useRef<THREE.Group>(null)
  const { actions } = useAnimations(animations, inner)
  const current = useRef<string | null>(null)

  const { scale, lift } = useMemo(() => {
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    const size = new THREE.Vector3()
    box.getSize(size)
    const s = HEIGHT_M / (size.y || 1)
    return { scale: s, lift: -box.min.y * s }
  }, [scene])

  const headBone = useMemo(() => {
    const bones: THREE.Bone[] = []
    scene.traverse((o) => {
      if ((o as THREE.Bone).isBone && /head/i.test(o.name)) bones.push(o as THREE.Bone)
    })
    return bones[0] ?? null
  }, [scene])
  const glassesObject = useMemo(() => buildGlasses(), [])
  const glassesRef = useRef<THREE.Group>(null)

  useEffect(() => {
    recolorPalette(scene)
    // Skinned meshes animate outside their rest-pose bounds; never cull.
    scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false
    })
  }, [scene])

  /** Find a clip action by suffix ("Idle" matches "CharacterArmature|Idle"). */
  const byName = (suffix: string): THREE.AnimationAction | null => {
    for (const [key, action] of Object.entries(actions)) {
      if (key === suffix || key.endsWith(`|${suffix}`)) return action
    }
    return null
  }

  useFrame(() => {
    // Glasses follow the animated head bone, staying meter-sized regardless
    // of the rig's internal bone scales. Expressed in the parent group's
    // space (parent⁻¹ × headWorld) so the avatar root's own transform isn't
    // applied twice; scale from the decompose is discarded on purpose.
    const glasses = glassesRef.current
    if (glasses && headBone && glasses.parent) {
      headBone.updateWorldMatrix(true, false)
      _m.copy(glasses.parent.matrixWorld).invert().multiply(headBone.matrixWorld)
      _m.decompose(glasses.position, glasses.quaternion, _discardScale)
      // Head bone origin sits at the neck; eyes are ~0.14 m up, face-forward.
      glasses.translateY(0.14)
      glasses.translateZ(0.075)
    }

    const want = controlsRuntime.airborne
      ? 'Jump'
      : controlsRuntime.locomotion === 'run'
        ? 'Run'
        : controlsRuntime.locomotion === 'walk'
          ? 'Walk'
          : 'Idle'
    if (want === current.current) return
    const next = byName(want)
    if (!next) return
    const prev = current.current ? byName(current.current) : null
    prev?.fadeOut(FADE_S)
    next.reset().fadeIn(FADE_S).play()
    if (want === 'Jump') {
      next.setLoop(THREE.LoopOnce, 1)
      next.clampWhenFinished = true
    }
    current.current = want
  })

  return (
    <group ref={ref}>
      {/* Model rest pose faces -Z; the controller's yaw convention is +Z. */}
      <group ref={inner} position={[0, lift, 0]} scale={scale} rotation-y={Math.PI}>
        <primitive object={scene} />
      </group>
      {/* World-space glasses, matrix-following the head bone (see useFrame). */}
      <primitive object={glassesObject} ref={glassesRef} />
      {/* Cheap blob shadow grounds the avatar without shadow maps. Sits at
          0.1 so the caps' ±0.08 vertex jitter can't poke through it. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.1, 0]}>
        <circleGeometry args={[0.5, 20]} />
        <meshBasicMaterial color="#14262b" transparent opacity={0.22} depthWrite={false} />
      </mesh>
    </group>
  )
})

useGLTF.preload('/models/avatar.glb', DRACO_PATH)
