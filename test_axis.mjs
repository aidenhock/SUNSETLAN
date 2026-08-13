import * as THREE from 'three'

// Test: extractBasis column 0
const m = new THREE.Matrix4()
const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4)
m.compose(new THREE.Vector3(1, 2, 3), q, new THREE.Vector3(1, 1, 1))

const col0 = new THREE.Vector3()
const col1 = new THREE.Vector3()
const col2 = new THREE.Vector3()
m.extractBasis(col0, col1, col2)

console.log('Column 0 (X axis):', col0)
console.log('Column 1 (Y axis):', col1)
console.log('Column 2 (Z axis):', col2)

// Expected: col0 should be (sin(π/4), 0, -cos(π/4)) = (0.707, 0, -0.707)
console.log('\nVerify: is col0 normalized?', Math.abs(col0.length() - 1))
console.log('Verify: is col0 = q * (1,0,0)?', col0.equals(new THREE.Vector3(1, 0, 0).applyQuaternion(q)))
