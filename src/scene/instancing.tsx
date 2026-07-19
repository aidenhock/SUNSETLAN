import { useGLTF } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { latLongToUnit, meridianYaw, surfaceQuaternion, WORLD_UP } from '../controls/planetMath'
import { PLANET_RADIUS } from './planetConfig'

export const DRACO_PATH = '/draco/'
export const IDENTITY_Q = new THREE.Quaternion()

/** World matrix for a part placed on the sphere (SurfaceGroup, but baked). */
export function surfacePartMatrix(
  lat: number,
  long: number,
  altitude: number,
  yaw: number,
  localPos: THREE.Vector3,
  localQuat: THREE.Quaternion,
  scale: number,
): THREE.Matrix4 {
  const unit = latLongToUnit(lat, long)
  const q = surfaceQuaternion(unit).multiply(
    new THREE.Quaternion().setFromAxisAngle(WORLD_UP, meridianYaw(lat, long) + yaw),
  )
  const surface = new THREE.Matrix4().compose(
    unit.clone().multiplyScalar(PLANET_RADIUS + altitude),
    q,
    new THREE.Vector3(1, 1, 1),
  )
  const local = new THREE.Matrix4().compose(
    localPos,
    localQuat,
    new THREE.Vector3(scale, scale, scale),
  )
  return surface.multiply(local)
}

/** One draw call for a repeated mesh; matrices are baked once at mount. */
export function StaticInstances({
  geometry,
  material,
  matrices,
}: {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  matrices: THREE.Matrix4[]
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [matrices])
  return <instancedMesh ref={meshRef} args={[geometry, material, matrices.length]} />
}

interface NormalizedPart {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  local: THREE.Matrix4
}

/**
 * Normalizes a loaded glTF: uniform scale so the model's height (or footprint)
 * equals targetSize, base lifted to y=0. Returns each mesh primitive with its
 * baked local matrix, ready to instance.
 */
export function useNormalizedParts(url: string, targetSize: number, axis: 'x' | 'y' | 'z' = 'y') {
  const { scene } = useGLTF(url, DRACO_PATH)
  return useMemo<NormalizedPart[]>(() => {
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)
    const scale = targetSize / (size[axis] || 1)
    // Kit models often sit away from their file's origin — recenter x/z and
    // lift the base to y=0 so placements land exactly where the map says.
    const norm = new THREE.Matrix4()
      .makeTranslation(-center.x, -box.min.y, -center.z)
      .premultiply(new THREE.Matrix4().makeScale(scale, scale, scale))
    const parts: NormalizedPart[] = []
    const materialCache = new Map<THREE.Material, THREE.Material>()
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh
        const src = mesh.material as THREE.MeshStandardMaterial
        // Clone once per source material and force the island's flat-matte
        // look — kit exports often ship smooth normals and PBR gloss.
        let mat = materialCache.get(src)
        if (!mat) {
          const clone = src.clone()
          clone.flatShading = true
          clone.roughness = 1
          clone.metalness = 0
          materialCache.set(src, clone)
          mat = clone
        }
        parts.push({
          geometry: mesh.geometry,
          material: mat,
          local: norm.clone().multiply(mesh.matrixWorld),
        })
      }
    })
    return parts
  }, [scene, targetSize, axis])
}

/**
 * A glTF model instanced at N sphere placements — one draw call per mesh
 * primitive regardless of N. Pass a single placement for one-off props.
 */
export function InstancedModel({
  url,
  targetSize,
  axis = 'y',
  placements,
}: {
  url: string
  targetSize: number
  axis?: 'x' | 'y' | 'z'
  placements: THREE.Matrix4[]
}) {
  const parts = useNormalizedParts(url, targetSize, axis)
  const composed = useMemo(
    () =>
      parts.map((p) => ({
        ...p,
        matrices: placements.map((P) => P.clone().multiply(p.local)),
      })),
    [parts, placements],
  )
  return (
    <>
      {composed.map((p, i) => (
        <StaticInstances key={i} geometry={p.geometry} material={p.material} matrices={p.matrices} />
      ))}
    </>
  )
}
