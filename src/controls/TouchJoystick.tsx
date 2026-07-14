import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { controlsRuntime } from './usePlanetController'

const RADIUS = 48 // max knob travel in px
const DEAD_ZONE = 0.15

/**
 * Left-side virtual joystick (~100-line custom equivalent of nipplejs per
 * CLAUDE.md). Uses pointer events so it works with touch, pen, and mouse.
 * Writes into controlsRuntime; never causes React renders while dragging
 * except to move the knob.
 */
export function TouchJoystick() {
  const baseRef = useRef<HTMLDivElement>(null)
  const pointerId = useRef<number | null>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })

  const reset = () => {
    pointerId.current = null
    controlsRuntime.joyX = 0
    controlsRuntime.joyY = 0
    setKnob({ x: 0, y: 0 })
  }

  // Safety: if a modal opens mid-drag, zero the input so the avatar doesn't
  // keep walking on close.
  useEffect(
    () =>
      useStore.subscribe((s) => {
        if (s.openModalId) reset()
      }),
    [],
  )

  const updateFromPointer = (e: React.PointerEvent) => {
    const base = baseRef.current
    if (!base) return
    const rect = base.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    let dx = e.clientX - cx
    let dy = e.clientY - cy
    const len = Math.hypot(dx, dy)
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS
      dy = (dy / len) * RADIUS
    }
    setKnob({ x: dx, y: dy })
    const nx = dx / RADIUS
    const ny = dy / RADIUS
    const mag = Math.hypot(nx, ny)
    if (mag < DEAD_ZONE) {
      controlsRuntime.joyX = 0
      controlsRuntime.joyY = 0
    } else {
      controlsRuntime.joyX = nx
      controlsRuntime.joyY = -ny // screen up = forward
    }
  }

  return (
    <div
      ref={baseRef}
      onPointerDown={(e) => {
        if (pointerId.current !== null) return
        pointerId.current = e.pointerId
        e.currentTarget.setPointerCapture(e.pointerId)
        updateFromPointer(e)
      }}
      onPointerMove={(e) => {
        if (e.pointerId === pointerId.current) updateFromPointer(e)
      }}
      onPointerUp={(e) => {
        if (e.pointerId === pointerId.current) reset()
      }}
      onPointerCancel={(e) => {
        if (e.pointerId === pointerId.current) reset()
      }}
      className="fixed bottom-6 left-6 z-30 h-32 w-32 touch-none rounded-full border-2 border-ink/30 bg-ink/20"
      aria-hidden="true"
      data-testid="touch-joystick"
    >
      <div
        className="absolute top-1/2 left-1/2 h-14 w-14 rounded-full bg-sand/90 shadow-md"
        style={{
          transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
        }}
      />
    </div>
  )
}
