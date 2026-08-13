import * as THREE from 'three';

// KOA dimensions
const H = 1.22;
const headsTall = 2.0;
const build = 1.02;

const headH = H / headsTall;
const legLen = H * 0.14;
const torsoH = H - headH - legLen;
const headR = headH * 0.51;
const headW = headR * 2;

const shoulderFrac = 0.2275;
const shoulderR = headW * shoulderFrac * build;
const armLenFrac = 0.87;
const armLen = torsoH * armLenFrac;

const elbowY = armLen * 0.42;
const shoulderX = shoulderR * 0.78;
const shoulderY = torsoH * 0.8;

console.log(`Arm dimensions:`);
console.log(`  shoulderX: ${shoulderX.toFixed(4)}`);
console.log(`  shoulderY: ${shoulderY.toFixed(4)}`);
console.log(`  elbowY: ${elbowY.toFixed(4)}`);

// Shoulder position in torso space
const shoulderPos = new THREE.Vector3(shoulderX, shoulderY, 0);
console.log(`Shoulder: (${shoulderPos.x.toFixed(4)}, ${shoulderPos.y.toFixed(4)}, ${shoulderPos.z.toFixed(4)})`);

// Arm rotation (fret hand)
const armRotation = new THREE.Euler(-0.95, 0, 0.25, 'XYZ');
const armQuat = new THREE.Quaternion().setFromEuler(armRotation);

// Forearm rotation
const forearmRotation = new THREE.Euler(-0.95, 0, 0.42, 'XYZ');
const forearmQuat = new THREE.Quaternion().setFromEuler(forearmRotation);

// Compute elbow position: shoulder + armQuat * (0, -elbowY, 0)
const elbowOffsetLocal = new THREE.Vector3(0, -elbowY, 0);
const elbowOffset = elbowOffsetLocal.clone().applyQuaternion(armQuat);
const elbowInTorsoSpace = shoulderPos.clone().add(elbowOffset);
console.log(`Elbow: (${elbowInTorsoSpace.x.toFixed(4)}, ${elbowInTorsoSpace.y.toFixed(4)}, ${elbowInTorsoSpace.z.toFixed(4)})`);

// Compute wrist position: elbow + (armQuat * forearmQuat) * (0, -elbowY, 0)
// The forearmQuat is relative to arm space, so we need to compose them
const composedQuat = armQuat.clone().multiply(forearmQuat);

const wristOffsetLocal = new THREE.Vector3(0, -elbowY, 0);
const wristOffset = wristOffsetLocal.clone().applyQuaternion(composedQuat);
const wristInTorsoSpace = shoulderPos.clone().add(wristOffset);

console.log(`Wrist: (${wristInTorsoSpace.x.toFixed(4)}, ${wristInTorsoSpace.y.toFixed(4)}, ${wristInTorsoSpace.z.toFixed(4)})`);

// The claimed neckGrip landmark position in torso space
const claimedWrist = new THREE.Vector3(0.269, 0.342, 0.298);
console.log(`Claimed: (${claimedWrist.x.toFixed(4)}, ${claimedWrist.y.toFixed(4)}, ${claimedWrist.z.toFixed(4)})`);

// Check distance
const dist = wristInTorsoSpace.distanceTo(claimedWrist);
console.log(`Distance: ${(dist * 1000).toFixed(2)} mm`);
console.log(`Match within ~2 mm? ${dist < 0.002}`);
