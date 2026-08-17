import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { latLongToUnit } from '../controls/planetMath'
import { PLANET_RADIUS } from '../scene/planetConfig'
import { bearingTo, cameraHeading, playerFrame, rangeTo, roomToScreen, toScreen } from './minimapMath'

/**
 * The minimap is a player-CENTRED bird's-eye view: everything is a
 * bearing and a range from wherever the avatar is standing, rotated so
 * the camera's heading points up. These pin the projection — a sign
 * error here silently mirrors the whole map.
 */

/** The planet quaternion that puts (lat, long) under the avatar. */
const quatFor = (lat: number, long: number) =>
  new THREE.Quaternion().setFromUnitVectors(latLongToUnit(lat, long), new THREE.Vector3(0, 1, 0))

describe('player frame', () => {
  it('north points toward the island centre, east is perpendicular', () => {
    const f = playerFrame(quatFor(40, 25))
    const toPole = latLongToUnit(90, 0)
    // Walking "north" must reduce the angle to the pole.
    const stepped = f.pole.clone().addScaledVector(f.north, 0.01).normalize()
    expect(stepped.angleTo(toPole)).toBeLessThan(f.pole.angleTo(toPole))
    expect(Math.abs(f.north.dot(f.pole))).toBeLessThan(1e-6)
    expect(Math.abs(f.east.dot(f.pole))).toBeLessThan(1e-6)
    expect(Math.abs(f.east.dot(f.north))).toBeLessThan(1e-6)
  })

  it('east increases longitude', () => {
    const f = playerFrame(quatFor(30, 100))
    const stepped = f.pole.clone().addScaledVector(f.east, 0.01).normalize()
    const long = (Math.atan2(stepped.x, stepped.z) * 180) / Math.PI
    expect(long).toBeGreaterThan(100)
  })
})

describe('range and bearing', () => {
  it('range is great-circle metres', () => {
    const f = playerFrame(quatFor(50, 0))
    // 10 degrees of latitude away, along the same meridian.
    const target = latLongToUnit(40, 0)
    const expected = (10 * Math.PI * PLANET_RADIUS) / 180
    expect(rangeTo(f, target, PLANET_RADIUS)).toBeCloseTo(expected, 4)
  })

  it('bearing is 0 toward the pole and ±90° to the sides', () => {
    const f = playerFrame(quatFor(40, 60))
    expect(bearingTo(f, latLongToUnit(90, 0))).toBeCloseTo(0, 5)
    // Due south (away from the pole) is a half turn.
    expect(Math.abs(bearingTo(f, latLongToUnit(20, 60)))).toBeCloseTo(Math.PI, 4)
    expect(bearingTo(f, latLongToUnit(40, 70))).toBeGreaterThan(0) // east
    expect(bearingTo(f, latLongToUnit(40, 50))).toBeLessThan(0) // west
  })

  it('the player is at zero range from itself', () => {
    const f = playerFrame(quatFor(33, 210))
    expect(rangeTo(f, latLongToUnit(33, 210), PLANET_RADIUS)).toBeCloseTo(0, 6)
  })
})

describe('camera heading', () => {
  it('matches the bearing of whatever the camera looks at', () => {
    const quat = quatFor(45, 12)
    const f = playerFrame(quat)
    // A world-space forward direction, converted into the planet frame,
    // should read the same bearing as a target lying along it.
    const forwardWorld = new THREE.Vector3(0, 0, -1)
    const heading = cameraHeading(f, forwardWorld, quat)
    const local = forwardWorld.clone().applyQuaternion(quat.clone().invert())
    const target = f.pole.clone().addScaledVector(local, 0.05).normalize()
    expect(heading).toBeCloseTo(bearingTo(f, target), 4)
  })
})

describe('screen mapping', () => {
  const out = { x: 0, y: 0 }

  it('puts a target dead ahead at the top of the map', () => {
    toScreen(10, 1.2, 1.2, 2, out) // bearing === heading
    expect(out.x).toBeCloseTo(0, 6)
    expect(out.y).toBeCloseTo(-20, 6) // canvas y grows downward
  })

  it('puts a target to the right when it is clockwise of the heading', () => {
    toScreen(10, Math.PI / 2, 0, 1, out)
    expect(out.x).toBeCloseTo(10, 6)
    expect(out.y).toBeCloseTo(0, 6)
  })

  it('room space rotates with the camera the same way', () => {
    // Facing +Z: something 5 m ahead (+Z) is up on the map.
    roomToScreen(0, 5, 0, 1, 1, out)
    expect(out.y).toBeCloseTo(-5, 6)
    expect(out.x).toBeCloseTo(0, 6)
    // Facing +Z: something 5 m east (+X) is to the LEFT on screen,
    // because facing +Z means +X is behind your right shoulder.
    roomToScreen(5, 0, 0, 1, 1, out)
    expect(out.x).toBeCloseTo(-5, 6)
    // Turn the camera to face +X and the same point moves to the top.
    roomToScreen(5, 0, 1, 0, 1, out)
    expect(out.y).toBeCloseTo(-5, 6)
  })
})
