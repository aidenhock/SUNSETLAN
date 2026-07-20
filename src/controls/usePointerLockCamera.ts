import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useStore } from '../store/useStore'
import { groundHeightAt } from './terrain'
import { controlsRuntime } from './usePlanetController'

const SENSITIVITY = 0.0025
const TOUCH_SENSITIVITY = 0.006
/** v3.2 look-up: pitch runs below horizontal; negative pitch drops the
 * camera low behind the avatar while LOOK_LIFT raises the target so the
 * sky/zenith fills the frame (avatar silhouetted at the bottom). */
const PITCH_MIN = -0.85
const PITCH_MAX = 1.25
const LOOK_LIFT_M = 12
/** The camera never goes below the analytic ground + this clearance. */
const CAM_GROUND_CLEAR = 0.4
const CAM_DIST = 7
const HEAD_HEIGHT = 1.2

const _camLocal = new THREE.Vector3()
const _qInv = new THREE.Quaternion()

/**
 * Third-person follow camera. Desktop default is pointer-lock mouse look
 * (click to lock; Esc releases — browser-enforced). Orbit mode and touch use
 * pointer-drag on the canvas instead. Azimuth is shared with the planet
 * controller via controlsRuntime so movement stays camera-relative; it is
 * written from the input handlers (not just per-frame) so the controller
 * never steers on a stale heading mid-look.
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

  // Initial azimuth π: the spawn view faces long 0 (dock and sunset water).
  const azimuth = useRef(Math.PI)
  const pitch = useRef(0.35)
  const target = useRef(new THREE.Vector3())

  // Click the canvas to acquire pointer lock (desktop, pointer-lock mode only).
  useEffect(() => {
    if (isTouch || cameraMode !== 'pointerLock') return
    const canvas = gl.domElement
    const onClick = () => {
      if (useStore.getState().openModalId) return
      if (document.pointerLockElement === canvas) return
      // Chromium rejects with SecurityError inside the ~1.25 s post-Esc
      // cooldown; swallow it (the user just clicks again).
      const request = canvas.requestPointerLock() as unknown
      if (request instanceof Promise) request.catch(() => {})
    }
    canvas.addEventListener('click', onClick)
    return () => {
      canvas.removeEventListener('click', onClick)
      // Leaving pointer-lock mode (menu toggle) must not strand a held lock.
      if (document.pointerLockElement === canvas) document.exitPointerLock()
    }
  }, [gl, isTouch, cameraMode])

  // Track lock state in the store (HUD shows the resume affordance from it).
  // If the lock grant lands after a modal opened (click on a mesh both
  // requests the lock and opens the modal), release it immediately.
  useEffect(() => {
    const onChange = () => {
      const locked = document.pointerLockElement === gl.domElement
      if (locked && useStore.getState().openModalId) {
        document.exitPointerLock()
        return
      }
      useStore.getState().setPointerLocked(locked)
    }
    document.addEventListener('pointerlockchange', onChange)
    return () => document.removeEventListener('pointerlockchange', onChange)
  }, [gl])

  // Mouse look while locked.
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return
      if (useStore.getState().openModalId) return
      azimuth.current -= e.movementX * SENSITIVITY
      pitch.current = THREE.MathUtils.clamp(
        pitch.current + e.movementY * SENSITIVITY,
        PITCH_MIN,
        PITCH_MAX,
      )
      controlsRuntime.azimuth = azimuth.current
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
    const endDrag = (pointerId: number) => {
      if (pointerId !== activeId) return
      activeId = null
      try {
        canvas.releasePointerCapture(pointerId)
      } catch {
        /* pointer already gone */
      }
    }
    const onDown = (e: PointerEvent) => {
      if (activeId !== null || useStore.getState().openModalId) return
      activeId = e.pointerId
      lastX = e.clientX
      lastY = e.clientY
      // Capture so pointerup is delivered even when released off-canvas.
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        /* capture unavailable — the buttons check below still ends the drag */
      }
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== activeId) return
      // A mouse with no buttons held, or a modal opening mid-drag, ends it.
      if ((e.pointerType === 'mouse' && e.buttons === 0) || useStore.getState().openModalId) {
        endDrag(e.pointerId)
        return
      }
      azimuth.current -= (e.clientX - lastX) * sens
      pitch.current = THREE.MathUtils.clamp(
        pitch.current + (e.clientY - lastY) * sens,
        PITCH_MIN,
        PITCH_MAX,
      )
      lastX = e.clientX
      lastY = e.clientY
      controlsRuntime.azimuth = azimuth.current
    }
    const onEnd = (e: PointerEvent) => endDrag(e.pointerId)
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
    // The intro swoop owns the camera until it finishes (useIntroSwoop).
    if (!useStore.getState().introDone) return
    if (controlsRuntime.azimuthOverride !== null) {
      azimuth.current = controlsRuntime.azimuthOverride
      controlsRuntime.azimuthOverride = null
    }
    if (controlsRuntime.pitchOverride !== null) {
      pitch.current = THREE.MathUtils.clamp(controlsRuntime.pitchOverride, PITCH_MIN, PITCH_MAX)
      controlsRuntime.pitchOverride = null
    }
    target.current.set(0, avatar.position.y + HEAD_HEIGHT, 0)
    const cp = Math.cos(pitch.current)
    const dist = controlsRuntime.camDist ?? CAM_DIST
    camera.position.set(
      target.current.x + Math.sin(azimuth.current) * cp * dist,
      target.current.y + Math.sin(pitch.current) * dist,
      target.current.z + Math.cos(azimuth.current) * cp * dist,
    )
    // Radial ground floor: clamp against the analytic ground under the
    // CAMERA's footprint (curvature-correct — world y would drift ~0.4 m
    // at follow distance). planetQuaternion is published by the controller.
    const len = camera.position.length()
    _camLocal
      .copy(camera.position)
      .applyQuaternion(_qInv.copy(controlsRuntime.planetQuaternion).invert())
      .normalize()
    const minLen = groundHeightAt(_camLocal) + CAM_GROUND_CLEAR
    if (len < minLen) camera.position.multiplyScalar(minLen / len)
    // Negative pitch lifts the gaze toward the zenith (eased).
    if (pitch.current < 0) {
      const t = pitch.current / PITCH_MIN
      target.current.y += t * t * LOOK_LIFT_M
    }
    camera.lookAt(target.current)
    controlsRuntime.azimuth = azimuth.current
    controlsRuntime.camPitch = pitch.current
  })
}
