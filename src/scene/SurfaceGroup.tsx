import { useMemo } from 'react'
import { latLongToUnit, meridianYaw, surfaceQuaternion } from '../controls/planetMath'
import { groundAltitudeAt } from '../controls/terrain'
import { PLANET_RADIUS, SINK_M } from './planetConfig'

/**
 * Positions children on the sphere surface. Local +Y is the surface normal
 * and local +Z points north along the meridian (toward the island center) —
 * `yaw` rotates from there. Altitude follows placement rule 1: derived from
 * the analytic ground minus a 0.1 m sink so bases bite into the terrain.
 * Pass `raise` for objects that must sit higher (e.g. on the dock deck) or
 * `altitude` to override entirely.
 */
export function SurfaceGroup({
  lat,
  long,
  altitude,
  raise = 0,
  yaw = 0,
  children,
}: {
  lat: number
  long: number
  /** Absolute altitude override (rare — prefer the analytic default). */
  altitude?: number
  /** Extra height on top of the analytic ground-minus-sink default. */
  raise?: number
  yaw?: number
  children: React.ReactNode
}) {
  const { position, quaternion, alignedYaw } = useMemo(() => {
    const unit = latLongToUnit(lat, long)
    const alt = altitude ?? groundAltitudeAt(lat, long) - SINK_M + raise
    return {
      position: unit.clone().multiplyScalar(PLANET_RADIUS + alt),
      quaternion: surfaceQuaternion(unit),
      alignedYaw: meridianYaw(lat, long) + yaw,
    }
  }, [lat, long, altitude, raise, yaw])
  return (
    <group position={position} quaternion={quaternion}>
      <group rotation-y={alignedYaw}>{children}</group>
    </group>
  )
}
