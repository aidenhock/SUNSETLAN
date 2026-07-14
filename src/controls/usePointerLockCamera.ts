import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useStore } from '../store/useStore'
import { controlsRuntime } from './usePlanetController'

const SENSITIVITY = 0.0025
const TOUCH_SENSITIVITY = 0.006
const PITCH_MIN = 0.08
const PITCH_MAX = 1.25
const CAM_DIST = 7
const HEAD_HEIGHT = 1.2

/**
 * Third-person follow camera. Desktop default is pointer-lock mouse look
 * (click to lock; Esc releases — browser-enforced). Orbit mode and touch use
 * pointer-drag on the canvas instead. Azimuth is shared with the planet
 * controller via controlsRuntime so movement stays camera-relative.
 */
export function usePointerLockCamera({
  avatarRef,
  isTouch,
}: {
  avatarRef: React.RefObject<THREE.Group | null>
  isTouch: boolean
}) {
  const { camera, gl } = useThree()
  const modalOpen = useStore((s) => s.openModalId !== null)
  const cameraMode = useStore((s) => s.settings.cameraMode)

  const azimuth = useRef(0)
  const pitch = useRef(0.35)
  const target = useRef(new THREE.Vector3())

  // Click the canvas to acquire pointer lock (desktop, pointer-lock mode only).
  useEffect(() => {
    if (isTouch || cameraMode !== 'pointerLock') return
    const canvas = gl.domElement
    const onClick = () => {
      if (useStore.getState().openModalId) return
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock()
    }
    canvas.addEventListener('click', onClick)
    return () => canvas.removeEventListener('click', onClick)
  }, [gl, isTouch, cameraMode])

  // Track lock state in the store (HUD shows the resume affordance from it).
  useEffect(() => {
    const onChange = () =>
      useStore.getState().setPointerLocked(document.pointerLockElement === gl.domElement)
    document.addEventListener('pointerlockchange', onChange)
    return () => document.removeEventListener('pointerlockchange', onChange)
  }, [gl])

  // Mouse look while locked.
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return
      azimuth.current -= e.movementX * SENSITIVITY
      pitch.current = THREE.MathUtils.clamp(
        pitch.current + e.movementY * SENSITIVITY,
        PITCH_MIN,
        PITCH_MAX,
      )
    }
    document.addEventListener('mousemove', onMouseMove)
    return () => document.removeEventListener('mousemove', onMouseMove)
  }, [gl])

  // Drag-to-orbit: touch always; desktop when the visitor picked orbit mode.
  useEffect(() => {
    if (!isTouch && cameraMode !== 'orbit') return
    const canvas = gl.domElement
    let activeId: number | null = null
    let lastX = 0
    let lastY = 0
    const sens = isTouch ? TOUCH_SENSITIVITY : SENSITIVITY * 1.6
    const onDown = (e: PointerEvent) => {
      if (activeId !== null || useStore.getState().openModalId) return
      activeId = e.pointerId
      lastX = e.clientX
      lastY = e.clientY
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== activeId) return
      azimuth.current -= (e.clientX - lastX) * sens
      pitch.current = THREE.MathUtils.clamp(
        pitch.current + (e.clientY - lastY) * sens,
        PITCH_MIN,
        PITCH_MAX,
      )
      lastX = e.clientX
      lastY = e.clientY
    }
    const onEnd = (e: PointerEvent) => {
      if (e.pointerId === activeId) activeId = null
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onEnd)
    canvas.addEventListener('pointercancel', onEnd)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onEnd)
      canvas.removeEventListener('pointercancel', onEnd)
    }
  }, [gl, isTouch, cameraMode])

  // Opening any modal programmatically exits pointer lock.
  useEffect(() => {
    if (modalOpen && document.pointerLockElement) document.exitPointerLock()
  }, [modalOpen])

  useFrame(() => {
    const avatar = avatarRef.current
    if (!avatar) return
    target.current.set(0, avatar.position.y + HEAD_HEIGHT, 0)
    const cp = Math.cos(pitch.current)
    camera.position.set(
      target.current.x + Math.sin(azimuth.current) * cp * CAM_DIST,
      target.current.y + Math.sin(pitch.current) * CAM_DIST,
      target.current.z + Math.cos(azimuth.current) * cp * CAM_DIST,
    )
    camera.lookAt(target.current)
    controlsRuntime.azimuth = azimuth.current
  })
}
