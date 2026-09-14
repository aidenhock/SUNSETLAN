import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { latLongToUnit, meridianYaw, surfaceQuaternion, WORLD_UP } from '../controls/planetMath'
import { PLANET_RADIUS } from './planetConfig'
import type { PropPart } from './props'
import {
  grooveBounce,
  grooveBpm,
  grooveCrownLean,
  grooveLean,
  grooveSquash,
  windDirAt,
  windLean,
} from './wind'

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

/** One hinge in a sway chain: rotate `angle` rad about prop-local `axis`,
 * pivoting at prop-local `pivot`. */
export interface SwayLink {
  pivot: THREE.Vector3
  axis: THREE.Vector3
  angle: number
}

/**
 * The instance matrix for a part hinged at SEVERAL pivots in series:
 * `placement × [T(p₀)R(a₀,θ₀)T(−p₀)] × [T(p₁)R(a₁,θ₁)T(−p₁)] × …`.
 * Earlier links are OUTER — they carry every later link's pivot with
 * them, which is exactly what makes a crown follow a leaning trunk.
 * Pure; reuses module scratch, so it allocates nothing beyond its `out`.
 */
export function swayMatrixChain(
  placement: THREE.Matrix4,
  links: readonly SwayLink[],
  out: THREE.Matrix4 = new THREE.Matrix4(),
): THREE.Matrix4 {
  out.copy(placement)
  for (let i = 0; i < links.length; i++) {
    const { pivot, axis, angle } = links[i]
    _swayQ.setFromAxisAngle(axis, angle)
    _swayR.makeRotationFromQuaternion(_swayQ)
    _swayT1.makeTranslation(pivot.x, pivot.y, pivot.z)
    _swayT2.makeTranslation(-pivot.x, -pivot.y, -pivot.z)
    out.multiply(_swayT1).multiply(_swayR).multiply(_swayT2)
  }
  return out
}

// The single-link case reuses one scratch link rather than allocating.
const _oneLink: SwayLink[] = [
  { pivot: new THREE.Vector3(), axis: new THREE.Vector3(1, 0, 0), angle: 0 },
]

/**
 * The instance matrix for a part that sways about `pivot` (prop-local) by
 * `angle` radians around `axis` (also prop-local): `placement × T(pivot) ×
 * R(axis, angle) × T(−pivot)` — the pivot point itself stays fixed in
 * world space, only the mass around it swings. The single-link case of
 * `swayMatrixChain`.
 */
export function swayMatrix(
  placement: THREE.Matrix4,
  pivot: THREE.Vector3,
  axis: THREE.Vector3,
  angle: number,
  out: THREE.Matrix4 = new THREE.Matrix4(),
): THREE.Matrix4 {
  _oneLink[0].pivot = pivot
  _oneLink[0].axis = axis
  _oneLink[0].angle = angle
  return swayMatrixChain(placement, _oneLink, out)
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

/** Everything about one dancing instance that never changes after mount. */
export interface SwayDatum {
  /** Prop-local axis whose POSITIVE rotation leans local up downwind. */
  leanAxis: THREE.Vector3
  /** Prop-local wind DIRECTION — rotating about it leans the tree left and
   * right ACROSS the wind, which is the groove's nod. */
  grooveAxis: THREE.Vector3
  phase: number
  bpm: number
}

/**
 * Solve one instance's dance data from its placement matrix — the wind is a
 * fixed planet-local direction, but each prop sits at its own tilt on the
 * sphere, so "downwind" means something different in every prop's local
 * frame. Done once at mount (see the build log's decision note), never per
 * frame.
 */
export function solveSwayDatum(m: THREE.Matrix4, index: number): SwayDatum {
  // The instance's planet-local unit position, straight from the placement
  // matrix's translation.
  _sPos.setFromMatrixPosition(m)
  _sUnit.copy(_sPos).normalize()
  windDirAt(_sUnit, _sWorldWind)
  // World (planet-local) wind direction → prop-local, via the INVERSE of
  // the placement's own rotation.
  m.decompose(_sDPos, _sDQuat, _sDScale)
  _sInvQuat.copy(_sDQuat).invert()
  const grooveAxis = _sLocalWind.copy(_sWorldWind).applyQuaternion(_sInvQuat).clone().normalize()
  // Rotating about this axis by +angle leans local +Y (up) toward local
  // +windDir — cross(up, windDir) is the axis that carries up INTO windDir
  // under a right-handed positive rotation.
  const leanAxis = new THREE.Vector3().crossVectors(_sLocalUp, grooveAxis)
  if (leanAxis.lengthSq() < 1e-10) leanAxis.set(1, 0, 0)
  else leanAxis.normalize()
  return { leanAxis, grooveAxis, phase: index * 2.399, bpm: grooveBpm(index) }
}

// Palm-groove scratch: the four hinges, plus the two link lists that pick
// how many of them apply. Module-level — the frame loop allocates nothing.
const _base = new THREE.Vector3(0, 0, 0)
const _crownScaled = new THREE.Vector3()
const _scaleM = new THREE.Matrix4()
const _lTrunkWind: SwayLink = { pivot: _base, axis: _sLocalUp, angle: 0 }
const _lTrunkGroove: SwayLink = { pivot: _base, axis: _sLocalUp, angle: 0 }
const _lCrownWind: SwayLink = { pivot: _crownScaled, axis: _sLocalUp, angle: 0 }
const _lCrownGroove: SwayLink = { pivot: _crownScaled, axis: _sLocalUp, angle: 0 }
const _trunkLinks: SwayLink[] = [_lTrunkWind, _lTrunkGroove]
const _crownLinks: SwayLink[] = [_lTrunkWind, _lTrunkGroove, _lCrownWind, _lCrownGroove]

/**
 * The full palm dance for one instance at time `t`:
 *
 *   `placement × trunkWind × trunkGroove [× crownWind × crownGroove] × S(c, s, c)`
 *
 * The beat BOUNCE is the INNERMOST transform — the geometry is squashed and
 * stretched about the base first, then the whole stretched tree is rotated
 * rigidly. (Scaling last instead would shear a leaning trunk rather than
 * stretch it.) Because the hinges act on already-scaled geometry, the crown
 * pivot is expressed in the SCALED frame, `pivot · (c, s, c)` — that is what
 * keeps the crown welded to the trunk top as the tree rises on the beat.
 *
 * The trunk hinges at the base (0,0,0) and carries the crown with it; the
 * crown adds its own two hinges on top, a whip trailing the trunk.
 *
 * Pass `crownPivot` undefined for the trunk part — it gets the trunk links
 * only, so its base stays planted.
 */
export function palmSwayMatrix(
  placement: THREE.Matrix4,
  d: SwayDatum,
  crownPivot: THREE.Vector3 | undefined,
  t: number,
  out: THREE.Matrix4 = new THREE.Matrix4(),
): THREE.Matrix4 {
  const s = grooveBounce(t, d.phase, d.bpm)
  const c = grooveSquash(s)

  const wind = windLean(t, d.phase)
  _lTrunkWind.axis = d.leanAxis
  _lTrunkWind.angle = wind
  _lTrunkGroove.axis = d.grooveAxis
  _lTrunkGroove.angle = grooveLean(t, d.phase, d.bpm)

  if (crownPivot) {
    _crownScaled.set(crownPivot.x * c, crownPivot.y * s, crownPivot.z * c)
    _lCrownWind.axis = d.leanAxis
    _lCrownWind.angle = wind
    _lCrownGroove.axis = d.grooveAxis
    _lCrownGroove.angle = grooveCrownLean(t, d.phase, d.bpm)
  }

  swayMatrixChain(placement, crownPivot ? _crownLinks : _trunkLinks, out)
  return out.multiply(_scaleM.makeScale(c, s, c))
}

/**
 * Like StaticInstances, but the prop DANCES: the whole tree leans left and
 * right on the groove and bounces on the beat about its base, and parts
 * that name a `crownPivot` add their own lagging swing on top. One global
 * wind (wind.ts) plus a per-instance phase and BPM jitter, so a grove reads
 * as a loose crowd rather than a chorus line.
 */
export function SwayInstances({
  geometry,
  material,
  matrices,
  crownPivot,
}: {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  matrices: THREE.Matrix4[]
  crownPivot?: THREE.Vector3
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const data = useRef<SwayDatum[]>([])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    data.current = matrices.map((m, i) => solveSwayDatum(m, i))
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
      palmSwayMatrix(matrices[i], items[i], crownPivot, t, _sOut)
      mesh.setMatrixAt(i, _sOut)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={meshRef} args={[geometry, material, matrices.length]} />
}

/**
 * A chunky prop (see props.ts) instanced at N sphere placements — one draw
 * call per material part regardless of N. Pass one placement for one-offs.
 * Parts tagged `sway` (props.ts) dance in the wind and on the beat; the
 * rest are static.
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
            crownPivot={p.sway.crownPivot}
          />
        ) : (
          <StaticInstances key={i} geometry={p.geometry} material={p.material} matrices={placements} />
        ),
      )}
    </>
  )
}
