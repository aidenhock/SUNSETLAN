import * as THREE from 'three'

// Log 0 at lat 25.3, long 180; fire at lat 22, long 180
function latLongToUnit(latDeg, longDeg) {
  const polar = THREE.MathUtils.degToRad(90 - latDeg)
  const long = THREE.MathUtils.degToRad(longDeg)
  return new THREE.Vector3(
    Math.sin(polar) * Math.sin(long),
    Math.cos(polar),
    Math.sin(polar) * Math.cos(long)
  )
}

const PLANET_RADIUS = 55
const STAND_AHEAD_M = 0.55
const LOG_BLOCKER_R = 0.9
const FIRE_BLOCKER_R = 1.2

const fireUnit = latLongToUnit(22, 180)
const log0Unit = latLongToUnit(25.3, 180)

// Distance from log center to fire center
const distToFire = log0Unit.angleTo(fireUnit) * PLANET_RADIUS
console.log('Distance from log 0 center to fire center:', distToFire.toFixed(2), 'm')

// For a seat at offsetM = 0 (log center), the stand spot moves STAND_AHEAD_M toward the fire
// The arc distance to fire after the stand-up:
const distToFireAfterStand = distToFire - STAND_AHEAD_M
console.log('Distance from stand spot (offsetM=0) to fire center:', distToFireAfterStand.toFixed(2), 'm')
console.log('Fire blocker radius:', FIRE_BLOCKER_R, 'm')
console.log('Stand spot outside fire blocker?', distToFireAfterStand > FIRE_BLOCKER_R ? 'YES' : 'NO')

// For a seat at offsetM = ±0.7, the seat is offset along the log axis
// The log axis is roughly perpendicular to the meridian, and the stand displacement
// is toward the fire (roughly along the meridian). So the displacements are roughly perpendicular.
// Distance from stand spot to log center: sqrt(0.7² + 0.55²)
const standDistFromLogCenter = Math.sqrt(0.7 * 0.7 + 0.55 * 0.55)
console.log('\nStand spot distance from log center (offsetM=±0.7):', standDistFromLogCenter.toFixed(2), 'm')
console.log('Log blocker radius:', LOG_BLOCKER_R, 'm')
console.log('Stand spot inside log blocker?', standDistFromLogCenter < LOG_BLOCKER_R ? 'YES' : 'NO')
console.log('Stand spot at blocker edge?', Math.abs(standDistFromLogCenter - LOG_BLOCKER_R) < 0.05 ? 'YES (within 0.05 m)' : 'NO')

