import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { murals } from '../content/murals'
import { cameraRelativeMoveDir, latLongToUnit } from '../controls/planetMath'
import { controlsRuntime } from '../controls/usePlanetController'
import { ROOM, roomRuntime } from '../controls/useRoomController'
import {
  CEMETERY_FOOTPRINT,
  DOCK_LINE,
  MARKERS,
  MOON_UNIT,
  SCATTER,
  SEATS,
  SUN_UNIT,
  type MapMarker,
} from './mapIcons'
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
 * It reads like a Minecraft map rather than a list of pins: land in its
 * own greens and tans, palms as green blobs, every monument in its own
 * colour, and the two big things — the cemetery's walled plot and the
 * dock — drawn as the FOOTPRINT you actually walk. No labels. The sea
 * is painted as a gradient between the island's two permanent moods,
 * warm at the sunset meridian and deep blue at the night one, with the
 * sun and moon marked out on the water where they really hang.
 *
 * Inside the build-log room the same canvas switches to the room's
 * rectangle, with the murals along the walls and the rift at the centre.
 */

const SIZE_DESKTOP = 130
const SIZE_MOBILE = 100
/** Metres from the player to the edge of the map. */
const RANGE_M = 92
const ROOM_RANGE_M = 22

// Palette (matches the island bands and the two skies).
const SAND = '#e8d5a3'
const GRASS = '#58b268'
const GRASS_EDGE = '#3f8f4f'
const SEA_SUN = '#2f8ea8' // water under the sunset side
const SEA_MID = '#1d6e73'
const SEA_NIGHT = '#16243f' // water under the night side
const ROOM_FLOOR = '#0b1a12'
const ROOM_WALL = '#3aff7e'

const WATERLINE_LAT = 15
const RING_SAMPLES = 64

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

    /** Project a planet-local unit into map pixels. */
    const project = (u: THREE.Vector3, heading: number, pxPerM: number) => {
      toScreen(rangeTo(_frame, u, PLANET_RADIUS), bearingTo(_frame, u), heading, pxPerM, _pt)
      return _pt
    }

    const polygon = (units: THREE.Vector3[], heading: number, pxPerM: number) => {
      ctx.beginPath()
      for (let i = 0; i < units.length; i++) {
        const p = project(units[i], heading, pxPerM)
        if (i === 0) ctx.moveTo(c + p.x, c + p.y)
        else ctx.lineTo(c + p.x, c + p.y)
      }
      ctx.closePath()
    }

    const marker = (m: MapMarker, heading: number, pxPerM: number, scale: number) => {
      const p = project(m.unit, heading, pxPerM)
      const x = c + p.x
      const y = c + p.y
      const r = m.icon.size * scale
      if (m.icon.glow) {
        ctx.beginPath()
        ctx.arc(x, y, r * 2.4, 0, Math.PI * 2)
        ctx.fillStyle = m.icon.glow
        ctx.fill()
      }
      ctx.fillStyle = m.icon.color
      if (m.icon.shape === 'square') {
        ctx.fillRect(x - r, y - r, r * 2, r * 2)
      } else if (m.icon.shape === 'diamond' || m.icon.shape === 'star') {
        // A four-point star reads as "not a place, a portal".
        ctx.beginPath()
        const inner = m.icon.shape === 'star' ? r * 0.32 : r * 0.7
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 - Math.PI / 2
          const rad = i % 2 === 0 ? r : inner
          const px = x + Math.cos(a) * rad
          const py = y + Math.sin(a) * rad
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        ctx.fill()
      } else {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const drawIsland = () => {
      const pxPerM = mapR / RANGE_M
      const scale = size / SIZE_DESKTOP
      playerFrame(controlsRuntime.planetQuaternion, _frame)
      cameraRelativeMoveDir(0, 1, controlsRuntime.azimuth, _fwd)
      const heading = cameraHeading(_frame, _fwd, controlsRuntime.planetQuaternion)

      // Sea: a gradient along the sun→moon axis, so the map carries the
      // island's two permanent moods instead of one flat blue.
      const sun = project(SUN_UNIT, heading, pxPerM)
      const sunX = c + sun.x
      const sunY = c + sun.y
      const moon = project(MOON_UNIT, heading, pxPerM)
      const moonX = c + moon.x
      const moonY = c + moon.y
      const sea = ctx.createLinearGradient(sunX, sunY, moonX, moonY)
      sea.addColorStop(0, SEA_SUN)
      sea.addColorStop(0.5, SEA_MID)
      sea.addColorStop(1, SEA_NIGHT)
      ctx.fillStyle = sea
      ctx.beginPath()
      ctx.arc(c, c, mapR, 0, Math.PI * 2)
      ctx.fill()
      ctx.save()
      ctx.clip()

      // The sun and moon themselves, pinned to the rim when they fall
      // outside the view so they always say which way each side is.
      const body = (x: number, y: number, fill: string, halo: string) => {
        const dx = x - c
        const dy = y - c
        const d = Math.hypot(dx, dy)
        const lim = mapR - 7 * scale
        const px = d > lim ? c + (dx / d) * lim : x
        const py = d > lim ? c + (dy / d) * lim : y
        ctx.beginPath()
        ctx.arc(px, py, 6 * scale, 0, Math.PI * 2)
        ctx.fillStyle = halo
        ctx.fill()
        ctx.beginPath()
        ctx.arc(px, py, 3.2 * scale, 0, Math.PI * 2)
        ctx.fillStyle = fill
        ctx.fill()
      }
      body(sunX, sunY, '#ffe9a8', 'rgba(255,184,112,0.45)')
      body(moonX, moonY, '#e8eeff', 'rgba(159,180,255,0.35)')

      // Land.
      polygon(SHORE_RING, heading, pxPerM)
      ctx.fillStyle = SAND
      ctx.fill()
      polygon(GRASS_RING, heading, pxPerM)
      ctx.fillStyle = GRASS
      ctx.fill()
      ctx.strokeStyle = GRASS_EDGE
      ctx.lineWidth = 1
      ctx.stroke()

      // The dock, as the strip it is.
      const a = project(DOCK_LINE[0], heading, pxPerM)
      const ax = c + a.x
      const ay = c + a.y
      const b = project(DOCK_LINE[1], heading, pxPerM)
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(c + b.x, c + b.y)
      ctx.strokeStyle = '#8a6a45'
      ctx.lineWidth = 2.6 * scale
      ctx.lineCap = 'round'
      ctx.stroke()

      // The cemetery, as its walled plot.
      polygon(CEMETERY_FOOTPRINT, heading, pxPerM)
      ctx.fillStyle = 'rgba(126,138,118,0.85)'
      ctx.fill()
      ctx.strokeStyle = '#3a3f47'
      ctx.lineWidth = 1.2 * scale
      ctx.stroke()

      // Nature first, then seats, then the monuments on top.
      for (const m of SCATTER) marker(m, heading, pxPerM, scale)
      for (const m of SEATS) marker(m, heading, pxPerM, scale)
      for (const m of MARKERS) marker(m, heading, pxPerM, scale)
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
