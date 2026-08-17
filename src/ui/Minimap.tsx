import { useEffect, useMemo, useRef } from 'react'
import { interactables } from '../content/interactables'
import { poleInPlanetSpace } from '../controls/planetMath'
import { controlsRuntime } from '../controls/usePlanetController'
import { useStore } from '../store/useStore'
import {
  cameraBearing,
  cellIndex,
  cellsWithinRange,
  LAT_BANDS,
  LONG_SECTORS,
  loadExplored,
  projectPolar,
  radiusAtLat,
  saveExplored,
  TOTAL_CELLS,
} from './minimapMath'
import * as THREE from 'three'

/**
 * Circular minimap HUD (top-left): a 2D canvas — never a second
 * three.js scene — drawn at ~10 Hz (5 Hz on low tier), zero per-frame
 * allocations. Polar projection with long 0 up (the sunset side is
 * always "north": the map doubles as a compass). Exploration fog over
 * an 8×24 cell grid, eased reveal (instant under reduced motion),
 * persisted to localStorage with a versioned key and a no-storage
 * fallback. Discovered interactables appear as labelled dots once
 * their cell is explored. Toggled with M / the HUD menu; hidden on
 * /classic by construction (this component only mounts in the world
 * app).
 */

const SIZE_DESKTOP = 130
const SIZE_MOBILE = 100
const EXPLORE_RANGE_M = 6
const REVEAL_S = 0.4

// Palette (map-local; matches the island bands).
const SEA = '#1d6e73'
const SAND = '#e8d5a3'
const GRASS = '#58b268'
const FOG = 'rgba(11, 18, 28, 0.62)'

const BAND_DEG = (90 - 13) / LAT_BANDS
const SECTOR_RAD = (Math.PI * 2) / LONG_SECTORS

/** Interactable dots, precomputed unit-scale (planet-local lat/long). */
const DOTS = interactables.map((def) => {
  const v = new THREE.Vector3(...def.position).normalize()
  const lat = 90 - (Math.acos(THREE.MathUtils.clamp(v.y, -1, 1)) * 180) / Math.PI
  const long = (Math.atan2(v.x, v.z) * 180) / Math.PI
  return { label: def.label, lat, long, cell: cellIndex(lat, long) }
})

const _pole = new THREE.Vector3()

export function Minimap({ isTouch }: { isTouch: boolean }) {
  const visible = useStore((s) => s.minimapVisible)
  // The portal room replaces the world view entirely — no island HUD
  // floating over it (other modals are cards, and keep their context).
  const inRoom = useStore((s) => s.openModalId === 'matrix')
  const resetCount = useStore((s) => s.minimapResetCount)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const explored = useRef<Set<number>>(loadExplored(typeof localStorage !== 'undefined' ? localStorage : null))
  const alphas = useRef(new Float32Array(TOTAL_CELLS))
  const seeded = useRef(false)
  if (!seeded.current) {
    for (const idx of explored.current) alphas.current[idx] = 1
    seeded.current = true
  }

  // Exploration reset from the HUD menu.
  const lastReset = useRef(resetCount)
  useEffect(() => {
    if (resetCount === lastReset.current) return
    lastReset.current = resetCount
    explored.current.clear()
    alphas.current.fill(0)
    saveExplored(typeof localStorage !== 'undefined' ? localStorage : null, explored.current)
  }, [resetCount])

  const size = isTouch ? SIZE_MOBILE : SIZE_DESKTOP
  const reduced = useMemo(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!visible || !canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    const R = size / 2

    const tickMs = useStore.getState().qualityTier === 'low' ? 200 : 100
    const tickS = tickMs / 1000
    let dirtyStorage = false
    const draw = () => {
      // Player lat/long from the live planet quaternion — the same
      // math the world uses (pole pulled back through the rotation).
      poleInPlanetSpace(controlsRuntime.planetQuaternion, _pole)
      const lat = 90 - (Math.acos(THREE.MathUtils.clamp(_pole.y, -1, 1)) * 180) / Math.PI
      const long = (Math.atan2(_pole.x, _pole.z) * 180) / Math.PI

      // Discover cells within range; ease their reveal.
      for (const idx of cellsWithinRange(lat, long, EXPLORE_RANGE_M)) {
        if (!explored.current.has(idx)) {
          explored.current.add(idx)
          dirtyStorage = true
        }
      }
      const step = reduced ? 1 : tickS / REVEAL_S
      for (const idx of explored.current) {
        if (alphas.current[idx] < 1) alphas.current[idx] = Math.min(1, alphas.current[idx] + step)
      }
      if (dirtyStorage) {
        dirtyStorage = false
        saveExplored(typeof localStorage !== 'undefined' ? localStorage : null, explored.current)
      }

      // --- draw ---
      ctx.clearRect(0, 0, size, size)
      ctx.save()
      ctx.beginPath()
      ctx.arc(R, R, R, 0, Math.PI * 2)
      ctx.clip()
      // Sea, sand disc, grass disc, waterline ring.
      ctx.fillStyle = SEA
      ctx.fillRect(0, 0, size, size)
      ctx.fillStyle = SAND
      ctx.beginPath()
      ctx.arc(R, R, radiusAtLat(15, R), 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = GRASS
      ctx.beginPath()
      ctx.arc(R, R, radiusAtLat(24, R), 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(R, R, radiusAtLat(15, R), 0, Math.PI * 2)
      ctx.stroke()

      // Fog wedges over unexplored cells (annulus sectors).
      ctx.fillStyle = FOG
      for (let band = 0; band < LAT_BANDS; band++) {
        const r0 = ((band * BAND_DEG) / (90 - 13)) * R
        const r1 = (((band + 1) * BAND_DEG) / (90 - 13)) * R
        for (let sector = 0; sector < LONG_SECTORS; sector++) {
          const a = alphas.current[band * LONG_SECTORS + sector]
          if (a >= 1) continue
          // Canvas angles: 0 = +x (map east); map-up (long 0) = -π/2.
          const a0 = -Math.PI / 2 + sector * SECTOR_RAD
          ctx.globalAlpha = 1 - a
          ctx.beginPath()
          ctx.arc(R, R, r1, a0, a0 + SECTOR_RAD)
          ctx.arc(R, R, r0, a0 + SECTOR_RAD, a0, true)
          ctx.closePath()
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1

      // Discovered interactables: labelled dots once their cell shows.
      ctx.font = '600 7px system-ui, sans-serif'
      ctx.textAlign = 'center'
      for (const dot of DOTS) {
        if (alphas.current[dot.cell] < 0.5) continue
        const p = projectPolar(dot.lat, dot.long, R - 4)
        ctx.fillStyle = '#14262b'
        ctx.beginPath()
        ctx.arc(R + p.x, R + p.y, 2.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#35a7a0'
        ctx.beginPath()
        ctx.arc(R + p.x, R + p.y, 1.6, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.fillText(dot.label, R + p.x, R + p.y - 4)
      }

      // Player marker + camera-facing cone.
      const pp = projectPolar(lat, long, R - 4)
      const bearing = cameraBearing(long, controlsRuntime.azimuth)
      const cx = R + pp.x
      const cy = R + pp.y
      ctx.fillStyle = 'rgba(255, 184, 112, 0.35)'
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, 11, bearing - Math.PI / 2 - 0.45, bearing - Math.PI / 2 + 0.45)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#14262b'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(cx, cy, 3.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.restore()

      // Rim.
      ctx.strokeStyle = 'rgba(20, 38, 43, 0.8)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(R, R, R - 1, 0, Math.PI * 2)
      ctx.stroke()
    }

    draw()
    const iv = setInterval(draw, tickMs)
    return () => clearInterval(iv)
  }, [visible, size, reduced, resetCount])

  if (!visible || inRoom) return null
  return (
    <canvas
      ref={canvasRef}
      data-minimap
      role="img"
      aria-label="Minimap — explored areas of the island, long 0 at the top"
      style={{ width: size, height: size }}
      className="pointer-events-none fixed top-6 left-6 z-30 rounded-full shadow-lg"
    />
  )
}
