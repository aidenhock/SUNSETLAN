import { useMemo } from 'react'
import * as THREE from 'three'
import { latLongToUnit, surfaceQuaternion } from '../controls/planetMath'
import { PLANET_RADIUS } from './planetConfig'

/** Callback for meshes that should be part of the walkable collision set. */
export type RegisterCollision = (mesh: THREE.Mesh | null) => void

/** Positions children on the sphere surface, local +Y = surface normal. */
export function SurfaceGroup({
  lat,
  long,
  altitude = 0,
  yaw = 0,
  children,
}: {
  lat: number
  long: number
  altitude?: number
  yaw?: number
  children: React.ReactNode
}) {
  const { position, quaternion } = useMemo(() => {
    const unit = latLongToUnit(lat, long)
    return {
      position: unit.clone().multiplyScalar(PLANET_RADIUS + altitude),
      quaternion: surfaceQuaternion(unit),
    }
  }, [lat, long, altitude])
  return (
    <group position={position} quaternion={quaternion}>
      <group rotation-y={yaw}>{children}</group>
    </group>
  )
}
