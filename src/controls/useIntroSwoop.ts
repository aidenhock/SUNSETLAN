import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useStore } from '../store/useStore'

/**
 * The signature entrance (CLAUDE.md 3B): the camera starts in space over the
 * terminator — both moods visible, sunset half and night half — then swoops
 * down to the follow position behind the avatar at the pole. A quadratic
 * bezier path, ease-in-out, ~4.5 s. Any input skips to the end. Disabled
 * (finishIntro immediately) for ?e2e runs and prefers-reduced-motion — the
 * loading screen's fade is the reduced-motion entrance.
 *
 * While the intro runs, usePointerLockCamera yields the camera (it checks
 * introDone) and usePlanetController ignores movement input.
 */

const DURATION_S = 4.5
// Over the terminator (the ±x side): sunset (+z) on one side of the frame,
// night (−z) on the other. P2 matches the follow camera at spawn (azimuth π,
// pitch 0.35, dist 7, head height 1.2 — see usePointerLockCamera).
const P0 = new THREE.Vector3(150, 130, -55)
const P1 = new THREE.Vector3(45, 95, -55)
const P2 = new THREE.Vector3(0, 60.4, -6.6)
const LOOK_START = new THREE.Vector3(0, 20, 0)
const LOOK_END = new THREE.Vector3(0, 57.9, 0)

const _pos = new THREE.Vector3()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _look = new THREE.Vector3()

const easeInOut = (t: number) => t * t * (3 - 2 * t)

export function useIntroSwoop({ enabled }: { enabled: boolean }) {
  const { camera } = useThree()
  const t = useRef(0)

  useEffect(() => {
    if (!enabled) {
      useStore.getState().finishIntro()
      return
    }
    // Any gesture skips the swoop — never hold the visitor hostage.
    const skip = () => useStore.getState().finishIntro()
    window.addEventListener('keydown', skip)
    window.addEventListener('pointerdown', skip)
    return () => {
      window.removeEventListener('keydown', skip)
      window.removeEventListener('pointerdown', skip)
    }
  }, [enabled])

  useFrame((_, dt) => {
    const store = useStore.getState()
    if (store.introDone) return
    t.current = Math.min(1, t.current + dt / DURATION_S)
    const e = easeInOut(t.current)
    // Quadratic bezier: lerp(lerp(P0,P1), lerp(P1,P2)).
    _a.lerpVectors(P0, P1, e)
    _b.lerpVectors(P1, P2, e)
    _pos.lerpVectors(_a, _b, e)
    camera.position.copy(_pos)
    camera.lookAt(_look.lerpVectors(LOOK_START, LOOK_END, e))
    if (t.current >= 1) store.finishIntro()
  })
}
