import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { latLongToUnit, meridianYaw, surfaceQuaternion, WORLD_UP } from '../controls/planetMath'
import { PLANET_RADIUS } from './planetConfig'
import type { PropPart } from './props'
import { windDirAt, windLean } from './wind'

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

// Sway matrix scratch — module-level so swayMatrix never allocates.
const _swayT1 = new THREE.Matrix4()
const _swayT2 = new THREE.Matrix4()
const _swayR = new THREE.Matrix4()
const _swayQ = new THREE.Quaternion()

/**
 * The instance matrix for a part that sways about `pivot` (prop-local) by
 * `angle` radians around `axis` (also prop-local): `placement × T(pivot) ×
 * R(axis, angle) × T(−pivot)` — the pivot point itself stays fixed in
 * world space, only the crown around it swings. Pure and testable; the
 * frame loop reuses module scratch, so this itself allocates nothing
 * extra beyond its `out`.
 */
export function swayMatrix(
  placement: THREE.Matrix4,
  pivot: THREE.Vector3,
  axis: THREE.Vector3,
  angle: number,
  out: THREE.Matrix4 = new THREE.Matrix4(),
): THREE.Matrix4 {
  _swayQ.setFromAxisAngle(axis, angle)
  _swayR.makeRotationFromQuaternion(_swayQ)
  _swayT1.makeTranslation(pivot.x, pivot.y, pivot.z)
  _swayT2.makeTranslation(-pivot.x, -pivot.y, -pivot.z)
  out.copy(placement).multiply(_swayT1).multiply(_swayR).multiply(_swayT2)
  return out
}

// SwayInstances scratch (mount-time; still module-level, never reallocated).
const _sPos = new THREE.Vector3()
const _sUnit = new THREE.Vector3()
const _sWorldWind = new THREE.Vector3()
const _sLocalWind = new THREE.Vector3()
const _sDPos = new THREE.Vector3()
const _sDScale = new THREE.Vector3()
const _sDQuat = new THREE.Quaternion()
const _sInvQuat = new THREE.Quaternion()
const _sLocalUp = new THREE.Vector3(0, 1, 0)
const _sOut = new THREE.Matrix4()

interface SwayDatum {
  axis: THREE.Vector3
  phase: number
}

/**
 * Like StaticInstances, but the crown leans in the wind: one global wind
 * (wind.ts), a per-instance phase so palms never move in unison, and a
 * per-instance sway AXIS solved once at mount from the placement's own
 * rotation (the wind is a fixed planet-local direction; each prop sits at
 * its own tilted orientation on the sphere, so "downwind" means something
 * different in every prop's local frame).
 */
export function SwayInstances({
  geometry,
  material,
  matrices,
  pivot,
}: {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  matrices: THREE.Matrix4[]
  pivot: THREE.Vector3
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const data = useRef<SwayDatum[]>([])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    data.current = matrices.map((m, i) => {
      // The instance's planet-local unit position, straight from the
      // placement matrix's translation.
      _sPos.setFromMatrixPosition(m)
      _sUnit.copy(_sPos).normalize()
      windDirAt(_sUnit, _sWorldWind)
      // World (planet-local) wind direction → prop-local, via the
      // INVERSE of the placement's own rotation.
      m.decompose(_sDPos, _sDQuat, _sDScale)
      _sInvQuat.copy(_sDQuat).invert()
      _sLocalWind.copy(_sWorldWind).applyQuaternion(_sInvQuat)
      // Rotating about this axis by +angle leans local +Y (up) toward
      // local +windDir — cross(up, windDir) is the axis that carries up
      // INTO windDir under a right-handed positive rotation.
      const axis = new THREE.Vector3().crossVectors(_sLocalUp, _sLocalWind)
      if (axis.lengthSq() < 1e-10) axis.set(1, 0, 0)
      else axis.normalize()
      return { axis, phase: i * 2.399 }
    })
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrices])

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = state.clock.elapsedTime
    const items = data.current
    for (let i = 0; i < items.length; i++) {
      const { axis, phase } = items[i]
      const angle = windLean(t, phase)
      swayMatrix(matrices[i], pivot, axis, angle, _sOut)
      mesh.setMatrixAt(i, _sOut)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={meshRef} args={[geometry, material, matrices.length]} />
}

/**
 * A chunky prop (see props.ts) instanced at N sphere placements — one draw
 * call per material part regardless of N. Pass one placement for one-offs.
 * Parts tagged `sway` (props.ts) sway in the wind; the rest are static.
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
      {parts.map((p, i) =>
        p.sway ? (
          <SwayInstances
            key={i}
            geometry={p.geometry}
            material={p.material}
            matrices={placements}
            pivot={p.sway.pivot}
          />
        ) : (
          <StaticInstances key={i} geometry={p.geometry} material={p.material} matrices={placements} />
        ),
      )}
    </>
  )
}
