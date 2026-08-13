// Simulate the edge detection logic
let seatedId = null
let storeSeat = null

function simulateEdgeDetection(newStoreSeat) {
  console.log('\n--- Edge Detection Frame ---')
  console.log('storeSeat:', newStoreSeat)
  console.log('seatedId.current:', seatedId)
  console.log('storeSeat !== seatedId.current?', newStoreSeat !== seatedId)
  
  if (newStoreSeat !== seatedId) {
    console.log('→ EDGE TRIGGERED: running sit/stand tween')
  } else {
    console.log('→ No edge: no tween')
  }
  
  seatedId = newStoreSeat
  console.log('seatedId.current updated to:', seatedId)
}

// Scenario 1: Player presses E to sit
console.log('=== Scenario 1: Press E to sit ===')
let seat1 = { log: 0, offsetM: 0.5 }
simulateEdgeDetection(seat1)

// Scenario 2: Frame 2 - player is still sitting, camera hasn't moved
console.log('\n=== Scenario 2: Next frame, still seated ===')
// storeSeat is the SAME object reference from scenario 1
simulateEdgeDetection(seat1)

// Scenario 3: Camera moves, but E not pressed - requestSit() is NOT called
console.log('\n=== Scenario 3: Camera moves, E not pressed ===')
// seatedSeat doesn't change because requestSit() is only called on E press
simulateEdgeDetection(seat1)

// Scenario 4: Player presses E again to stand up
console.log('\n=== Scenario 4: Press E to stand up ===')
simulateEdgeDetection(null)

// Scenario 5: After stand-up tween, next frame
console.log('\n=== Scenario 5: Next frame after stand tween ===')
simulateEdgeDetection(null)

// Scenario 6: Player presses E again to sit down (possibly different offset due to camera movement)
console.log('\n=== Scenario 6: Press E to sit down again ===')
let seat2 = { log: 0, offsetM: 0.52 }  // Different object, slightly different offset
simulateEdgeDetection(seat2)

// Scenario 7: Frame 2 after sitting down
console.log('\n=== Scenario 7: Next frame after sit ===')
simulateEdgeDetection(seat2)

console.log('\n✓ No issues: each E press creates a new edge, and same-object frames don\'t re-trigger')
