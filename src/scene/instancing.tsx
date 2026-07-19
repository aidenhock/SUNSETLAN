import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { latLongToUnit, meridianYaw, surfaceQuaternion, WORLD_UP } from '../controls/planetMath'
import { PLANET_RADIUS } from './planetConfig'
import type { PropPart } from './props'

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

/**
 * A chunky prop (see props.ts) instanced at N sphere placements — one draw
 * call per material part regardless of N. Pass one placement for one-offs.
 */
export function InstancedProp({
  parts,
  placements,
}: {
  parts: PropPart[]
  placements: THREE.Matrix4[]
}) {
  return (
    <>
      {parts.map((p, i) => (
        <StaticInstances key={i} geometry={p.geometry} material={p.material} matrices={placements} />
      ))}
    </>
  )
}
