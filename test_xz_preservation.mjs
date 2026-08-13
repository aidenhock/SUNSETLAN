import * as THREE from 'three'

// A static axis in world space (at identity planet rotation)
const staticAxis = new THREE.Vector3(1, 0.2, 0.5)
console.log('Static axis (at identity):', staticAxis)
console.log('Static XZ normalized:', [staticAxis.x / Math.hypot(staticAxis.x, staticAxis.z), staticAxis.z / Math.hypot(staticAxis.x, staticAxis.z)])

// Apply a planet rotation (rotation around Y)
const planetQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 3)
const rotatedAxis = staticAxis.clone().applyQuaternion(planetQ)
console.log('\nAfter planet rotation (π/3 around Y):', rotatedAxis)
console.log('Rotated XZ normalized:', [rotatedAxis.x / Math.hypot(rotatedAxis.x, rotatedAxis.z), rotatedAxis.z / Math.hypot(rotatedAxis.x, rotatedAxis.z)])

// Check: the normalized XZ should be a rotation of the original normalized XZ by π/3
const origNormXZ = [staticAxis.x, staticAxis.z]
const origLen = Math.hypot(origNormXZ[0], origNormXZ[1])
origNormXZ[0] /= origLen
origNormXZ[1] /= origLen

const rotNormXZ = [rotatedAxis.x, rotatedAxis.z]
const rotLen = Math.hypot(rotNormXZ[0], rotNormXZ[1])
rotNormXZ[0] /= rotLen
rotNormXZ[1] /= rotLen

console.log('\nOriginal normalized XZ:', origNormXZ)
console.log('Rotated normalized XZ:', rotNormXZ)

// The rotated should be: [cos(π/3)*origX - sin(π/3)*origZ, sin(π/3)*origX + cos(π/3)*origZ]
const expected = [
  Math.cos(Math.PI / 3) * origNormXZ[0] - Math.sin(Math.PI / 3) * origNormXZ[1],
  Math.sin(Math.PI / 3) * origNormXZ[0] + Math.cos(Math.PI / 3) * origNormXZ[1]
]
console.log('Expected rotated normalized XZ:', expected)
console.log('Match?', Math.abs(expected[0] - rotNormXZ[0]) < 1e-10 && Math.abs(expected[1] - rotNormXZ[1]) < 1e-10)
