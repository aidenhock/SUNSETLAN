import * as THREE from 'three';

// KOA dimensions (from buildNodes calculation)
const H = 1.22; // height
const headsTall = 2.0;
const build = 1.02;

const headH = H / headsTall; // 0.61
const legLen = H * 0.14; // 0.1708
const torsoH = H - headH - legLen; // 0.4392
const headR = headH * 0.51; // 0.3111
const headW = headR * 2; // 0.6222

const shoulderFrac = 0.2275; // default
const shoulderR = headW * shoulderFrac * build;
const armLenFrac = 0.87; // default
const armLen = torsoH * armLenFrac;

// Derived dims
const elbowY = armLen * 0.42;
const shoulderX = shoulderR * 0.78;
const shoulderY = torsoH * 0.8;

console.log(`Arm dimensions:`);
console.log(`  armLen: ${armLen.toFixed(4)}`);
console.log(`  elbowY: ${elbowY.toFixed(4)}`);
console.log(`  shoulderX: ${shoulderX.toFixed(4)}`);
console.log(`  shoulderY: ${shoulderY.toFixed(4)}`);

// Now compute the wrist position with the given rotations
const shoulderPos = new THREE.Vector3(shoulderX, shoulderY, 0);

// Arm rotation (fret hand - right arm)
const armRotation = new THREE.Euler(-0.95, 0, 0.25, 'XYZ');
const armQuat = new THREE.Quaternion().setFromEuler(armRotation);

// Forearm rotation
const forearmRotation = new THREE.Euler(-0.95, 0, 0.42, 'XYZ');
const forearmQuat = new THREE.Quaternion().setFromEuler(forearmRotation);

// Compute elbow position in torso space
const elbowLocal = new THREE.Vector3(0, -elbowY, 0);
elbowLocal.applyQuaternion(armQuat);
const elbowInTorsoSpace = shoulderPos.clone().add(elbowLocal);

console.log(`\nElbow position (torso space): (${elbowInTorsoSpace.x.toFixed(4)}, ${elbowInTorsoSpace.y.toFixed(4)}, ${elbowInTorsoSpace.z.toFixed(4)})`);

// Hand/wrist is at (0, -elbowY, 0) in forearm-local space
const wristLocal = new THREE.Vector3(0, -elbowY, 0);
wristLocal.applyQuaternion(forearmQuat);
const wristInTorsoSpace = elbowInTorsoSpace.clone().add(wristLocal);

console.log(`Wrist position (torso space): (${wristInTorsoSpace.x.toFixed(4)}, ${wristInTorsoSpace.y.toFixed(4)}, ${wristInTorsoSpace.z.toFixed(4)})`);

// The claimed neckGrip landmark position in torso space
const claimedWrist = new THREE.Vector3(0.269, 0.342, 0.298);
console.log(`Claimed neckGrip (torso space): (${claimedWrist.x.toFixed(4)}, ${claimedWrist.y.toFixed(4)}, ${claimedWrist.z.toFixed(4)})`);

// Check distance
const dist = wristInTorsoSpace.distanceTo(claimedWrist);
console.log(`Distance between computed and claimed: ${(dist * 1000).toFixed(2)} mm`);
console.log(`Match within ~2 mm? ${dist < 0.002}`);
