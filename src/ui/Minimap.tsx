import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { interactables } from '../content/interactables'
import { monuments } from '../content/monuments'
import { murals } from '../content/murals'
import { cameraRelativeMoveDir, latLongToUnit } from '../controls/planetMath'
import { controlsRuntime } from '../controls/usePlanetController'
import { ROOM, roomRuntime } from '../controls/useRoomController'
import { GRASS_POLAR_DEG, PLANET_RADIUS } from '../scene/planetConfig'
import { useStore } from '../store/useStore'
import {
  bearingTo,
  cameraHeading,
  playerFrame,
  rangeTo,
  roomToScreen,
  toScreen,
  type LocalFrame,
} from './minimapMath'

/**
 * Circular minimap HUD (top-left): a 2D canvas — never a second
 * three.js scene — redrawn every animation frame so the world slides
 * under the marker continuously instead of catching up when you stop.
 *
 * The view is a BIRD'S EYE centred on the character with the camera's
 * heading up: you are always the triangle in the middle, and the island
 * turns around you. The whole island is drawn from the start — no
 * exploration fog (the owner's call).
 *
 * Inside the build-log room the same canvas switches to the room's
 * rectangle, with the murals along the walls and the rift at the centre.
 */

const SIZE_DESKTOP = 130
const SIZE_MOBILE = 100
/** Metres from the player to the edge of the map. */
const RANGE_M = 92
const ROOM_RANGE_M = 22

// Palette (matches the island bands).
const SEA = '#1d6e73'
const SAND = '#e8d5a3'
const GRASS = '#58b268'
const ROOM_FLOOR = '#0b1a12'
const ROOM_WALL = '#3aff7e'

const WATERLINE_LAT = 15
const RING_SAMPLES = 64

/** Monument dots: everything in the index, labelled if it's interactable. */
const DOTS = monuments
  .filter((m) => m.kind !== 'seat')
  .map((m) => ({
    id: m.id,
    unit: latLongToUnit(m.lat, m.long),
    label: interactables.find((d) => d.id === m.id)?.label ?? null,
    kind: m.kind,
  }))

/** Pre-sampled island rings, in planet-local units. */
const ring = (lat: number) =>
  Array.from({ length: RING_SAMPLES }, (_, i) => latLongToUnit(lat, (i / RING_SAMPLES) * 360))
const GRASS_RING = ring(90 - GRASS_POLAR_DEG)
const SHORE_RING = ring(WATERLINE_LAT)

const _frame: LocalFrame = {
  pole: new THREE.Vector3(),
  north: new THREE.Vector3(),
  east: new THREE.Vector3(),
}
const _fwd = new THREE.Vector3()
const _pt = { x: 0, y: 0 }

export function Minimap({ isTouch }: { isTouch: boolean }) {
  const visible = useStore((s) => s.minimapVisible)
  const inRoom = useStore((s) => s.inRoom)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = isTouch ? SIZE_MOBILE : SIZE_DESKTOP

  useEffect(() => {
    if (!visible) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)
    const c = size / 2
    const mapR = c - 4

    /** Draw a closed polygon from a ring of planet-local units. */
    const ringPath = (units: THREE.Vector3[], heading: number, pxPerM: number) => {
      ctx.beginPath()
      for (let i = 0; i < units.length; i++) {
        const u = units[i]
        toScreen(rangeTo(_frame, u, PLANET_RADIUS), bearingTo(_frame, u), heading, pxPerM, _pt)
        if (i === 0) ctx.moveTo(c + _pt.x, c + _pt.y)
        else ctx.lineTo(c + _pt.x, c + _pt.y)
      }
      ctx.closePath()
    }

    const drawIsland = () => {
      const pxPerM = mapR / RANGE_M
      playerFrame(controlsRuntime.planetQuaternion, _frame)
      cameraRelativeMoveDir(0, 1, controlsRuntime.azimuth, _fwd)
      const heading = cameraHeading(_frame, _fwd, controlsRuntime.planetQuaternion)

      // Sea fills the disc; the island's two rings sit on top of it.
      ctx.fillStyle = SEA
      ctx.beginPath()
      ctx.arc(c, c, mapR, 0, Math.PI * 2)
      ctx.fill()
      ctx.save()
      ctx.clip()
      ringPath(SHORE_RING, heading, pxPerM)
      ctx.fillStyle = SAND
      ctx.fill()
      ringPath(GRASS_RING, heading, pxPerM)
      ctx.fillStyle = GRASS
      ctx.fill()

      // Monuments.
      for (const dot of DOTS) {
        toScreen(
          rangeTo(_frame, dot.unit, PLANET_RADIUS),
          bearingTo(_frame, dot.unit),
          heading,
          pxPerM,
          _pt,
        )
        const x = c + _pt.x
        const y = c + _pt.y
        ctx.beginPath()
        ctx.arc(x, y, dot.label ? 2.6 : 1.8, 0, Math.PI * 2)
        ctx.fillStyle = dot.label ? '#fff3d6' : 'rgba(255,243,214,0.5)'
        ctx.fill()
        if (dot.label) {
          ctx.font = '600 7px ui-sans-serif, system-ui'
          ctx.fillStyle = 'rgba(20,38,43,0.9)'
          ctx.textAlign = 'center'
          ctx.fillText(dot.label, x, y - 4.5)
        }
      }
      ctx.restore()
    }

    const drawRoom = () => {
      const pxPerM = mapR / ROOM_RANGE_M
      cameraRelativeMoveDir(0, 1, controlsRuntime.azimuth, _fwd)
      ctx.fillStyle = '#04120a'
      ctx.beginPath()
      ctx.arc(c, c, mapR, 0, Math.PI * 2)
      ctx.fill()
      ctx.save()
      ctx.clip()

      // The room's rectangle, drawn as four corners through the same
      // player-centred rotation the island map uses.
      const corners: Array<[number, number]> = [
        [-ROOM.halfX, -ROOM.halfZ],
        [ROOM.halfX, -ROOM.halfZ],
        [ROOM.halfX, ROOM.halfZ],
        [-ROOM.halfX, ROOM.halfZ],
      ]
      ctx.beginPath()
      corners.forEach(([x, z], i) => {
        roomToScreen(x - roomRuntime.x, z - roomRuntime.z, _fwd.x, _fwd.z, pxPerM, _pt)
        if (i === 0) ctx.moveTo(c + _pt.x, c + _pt.y)
        else ctx.lineTo(c + _pt.x, c + _pt.y)
      })
      ctx.closePath()
      ctx.fillStyle = ROOM_FLOOR
      ctx.fill()
      ctx.strokeStyle = ROOM_WALL
      ctx.lineWidth = 1.4
      ctx.stroke()

      // Murals along the walls, and the rift at the centre.
      for (const m of murals) {
        roomToScreen(m.at[0] - roomRuntime.x, m.at[1] - roomRuntime.z, _fwd.x, _fwd.z, pxPerM, _pt)
        ctx.beginPath()
        ctx.arc(c + _pt.x, c + _pt.y, 2.2, 0, Math.PI * 2)
        ctx.fillStyle = '#9ef7c0'
        ctx.fill()
      }
      roomToScreen(-roomRuntime.x, -roomRuntime.z, _fwd.x, _fwd.z, pxPerM, _pt)
      ctx.beginPath()
      ctx.arc(c + _pt.x, c + _pt.y, 3.4, 0, Math.PI * 2)
      ctx.fillStyle = '#bff0ff'
      ctx.fill()
      ctx.restore()
    }

    const drawMarker = () => {
      // The player is always dead centre, facing up.
      ctx.beginPath()
      ctx.moveTo(c, c - 5.5)
      ctx.lineTo(c - 3.6, c + 4)
      ctx.lineTo(c + 3.6, c + 4)
      ctx.closePath()
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = 'rgba(20,38,43,0.85)'
      ctx.lineWidth = 1
      ctx.fill()
      ctx.stroke()
      // Bezel.
      ctx.beginPath()
      ctx.arc(c, c, mapR, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(20,38,43,0.85)'
      ctx.lineWidth = 3
      ctx.stroke()
    }

    let raf = 0
    const frame = () => {
      ctx.clearRect(0, 0, size, size)
      if (roomRuntime.active) drawRoom()
      else drawIsland()
      drawMarker()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [visible, size, inRoom])

  if (!visible) return null
  return (
    <canvas
      ref={canvasRef}
      data-minimap
      role="img"
      aria-label={inRoom ? 'Map of the build-log room' : 'Map of the island'}
      style={{ width: size, height: size }}
      className="pointer-events-none fixed top-6 left-6 z-30 rounded-full"
    />
  )
}
