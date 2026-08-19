import { useCallback, useEffect, useRef, useState } from 'react'
import type { Placement } from '../content/placements'
import { controlsRuntime } from '../controls/usePlanetController'
import { poleInPlanetSpace } from '../controls/planetMath'
import * as THREE from 'three'
import { GRASS_POLAR_DEG } from '../scene/planetConfig'
import { usePlacementRuntime } from '../scene/placementRuntime'
import { iconFor } from '../ui/mapIcons'
import { metresPerDegree, project, pxPerMetre, unproject, type MapView } from './mapProjection'

/**
 * The plan view — laying the world out from above, which is what this
 * job actually is. Dragging a monument across a 3D planet means fighting
 * a camera, a horizon and a sphere; here the island holds still, every
 * placement is a dot you can hit, blocker radii are drawn at true size
 * so overlaps are obvious, and dropping something puts it exactly where
 * you let go.
 *
 * Drag an icon to move it (its parts come along), drag the stalk on the
 * selected one to turn it, wheel to zoom, drag the background to pan.
 * With a palette brush armed, clicking empty ground places there.
 */

const SIZE = 460
const WATERLINE_LAT = 15
const ISLAND_EDGE_LAT = 13
const GRASS_EDGE_LAT = 90 - GRASS_POLAR_DEG

const SEA = '#17394a'
const SAND = '#e8d5a3'
const GRASS = '#58b268'
const GRID = 'rgba(255,255,255,0.10)'

/** How far from an icon a click still counts as hitting it. */
const HIT_PX = 9
/** Length of the rotation stalk on the selected placement. */
const STALK_PX = 34

type Drag =
  | { kind: 'none' }
  | { kind: 'move'; id: string }
  | { kind: 'rotate'; id: string }
  | { kind: 'pan'; fromX: number; fromY: number; panX: number; panY: number }

const _pole = new THREE.Vector3()

export function MapEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [view, setView] = useState<MapView>({
    cx: SIZE / 2,
    cy: SIZE / 2,
    scale: SIZE / 2 / 80, // the whole island, edge to edge, on open
    panX: 0,
    panY: 0,
  })
  const viewRef = useRef(view)
  viewRef.current = view
  const drag = useRef<Drag>({ kind: 'none' })
  const moved = useRef(false)

  const list = usePlacementRuntime((s) => s.list)
  const selectedId = usePlacementRuntime((s) => s.selectedId)
  const listRef = useRef(list)
  listRef.current = list
  const selRef = useRef(selectedId)
  selRef.current = selectedId

  /** Whichever placement is under a point, nearest first. */
  const hitTest = useCallback((x: number, y: number): Placement | null => {
    const v = viewRef.current
    let best: Placement | null = null
    let bestD = HIT_PX
    for (const p of listRef.current) {
      const at = project(v, p.lat, p.long)
      const d = Math.hypot(at.x - x, at.y - y)
      if (d <= bestD) {
        bestD = d
        best = p
      }
    }
    return best
  }, [])

  // ---- drawing -------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = SIZE * dpr
    canvas.height = SIZE * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    let raf = 0
    const draw = () => {
      const v = viewRef.current
      const items = listRef.current
      const sel = selRef.current
      const mPx = pxPerMetre(v)

      ctx.clearRect(0, 0, SIZE, SIZE)
      ctx.fillStyle = SEA
      ctx.fillRect(0, 0, SIZE, SIZE)

      const disc = (lat: number, fill: string) => {
        const c = project(v, 90, 0)
        ctx.beginPath()
        ctx.arc(c.x, c.y, (90 - lat) * v.scale, 0, Math.PI * 2)
        ctx.fillStyle = fill
        ctx.fill()
      }
      disc(WATERLINE_LAT, SAND)
      disc(GRASS_EDGE_LAT, GRASS)

      // Latitude rings every 10°, plus the meridians, so you can read
      // roughly where you are without hovering anything.
      const centre = project(v, 90, 0)
      ctx.strokeStyle = GRID
      ctx.lineWidth = 1
      for (let lat = 80; lat >= ISLAND_EDGE_LAT; lat -= 10) {
        ctx.beginPath()
        ctx.arc(centre.x, centre.y, (90 - lat) * v.scale, 0, Math.PI * 2)
        ctx.stroke()
      }
      for (let long = 0; long < 360; long += 45) {
        const end = project(v, ISLAND_EDGE_LAT, long)
        ctx.beginPath()
        ctx.moveTo(centre.x, centre.y)
        ctx.lineTo(end.x, end.y)
        ctx.stroke()
      }
      // Which way is the sunset side.
      ctx.fillStyle = 'rgba(255,233,168,0.85)'
      ctx.font = '600 10px ui-sans-serif, system-ui'
      ctx.textAlign = 'center'
      const sunAt = project(v, ISLAND_EDGE_LAT - 2, 0)
      ctx.fillText('sun 0°', sunAt.x, sunAt.y)
      const moonAt = project(v, ISLAND_EDGE_LAT - 2, 180)
      ctx.fillStyle = 'rgba(232,238,255,0.85)'
      ctx.fillText('moon 180°', moonAt.x, moonAt.y)

      // Blockers first, underneath everything, at true scale.
      for (const p of items) {
        if (p.blockerRadiusM === undefined) continue
        const at = project(v, p.lat, p.long)
        ctx.beginPath()
        ctx.arc(at.x, at.y, p.blockerRadiusM * mPx, 0, Math.PI * 2)
        ctx.fillStyle = p.id === sel ? 'rgba(255,107,107,0.35)' : 'rgba(255,107,107,0.13)'
        ctx.fill()
      }

      // Footprints for the things that have one.
      for (const p of items) {
        if (!p.size) continue
        const hw = p.size.widthM / 2
        const hd = p.size.depthM / 2
        const yaw = (p.yawDeg * Math.PI) / 180
        const cos = Math.cos(yaw)
        const sin = Math.sin(yaw)
        ctx.beginPath()
        ;([
          [-hw, hd],
          [hw, hd],
          [hw, -hd],
          [-hw, -hd],
        ] as Array<[number, number]>).forEach(([e, n], i) => {
          const ee = e * cos + n * sin
          const nn = -e * sin + n * cos
          const lat = p.lat + nn / metresPerDegree
          const long = p.long + ee / (metresPerDegree * Math.cos((lat * Math.PI) / 180))
          const at = project(v, lat, long)
          if (i === 0) ctx.moveTo(at.x, at.y)
          else ctx.lineTo(at.x, at.y)
        })
        ctx.closePath()
        ctx.strokeStyle = p.id === sel ? '#ffd166' : 'rgba(58,63,71,0.9)'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // The placements themselves.
      for (const p of items) {
        const at = project(v, p.lat, p.long)
        const icon = iconFor(p)
        const r = (p.id === sel ? 5 : 3.6) * Math.max(0.7, Math.min(1.6, v.scale / 2.9))
        ctx.beginPath()
        if (icon.shape === 'square') ctx.rect(at.x - r, at.y - r, r * 2, r * 2)
        else ctx.arc(at.x, at.y, r, 0, Math.PI * 2)
        ctx.fillStyle = icon.color
        ctx.fill()
        if (p.parentId) {
          // A part of something bigger: tie it to its monument so the
          // grouping is visible before you drag and find out.
          const parent = items.find((q) => q.id === p.parentId)
          if (parent) {
            const pa = project(v, parent.lat, parent.long)
            ctx.beginPath()
            ctx.moveTo(at.x, at.y)
            ctx.lineTo(pa.x, pa.y)
            ctx.strokeStyle = 'rgba(255,255,255,0.16)'
            ctx.lineWidth = 1
            ctx.stroke()
          }
        }
        if (p.id === sel) {
          ctx.beginPath()
          ctx.arc(at.x, at.y, r + 4, 0, Math.PI * 2)
          ctx.strokeStyle = '#ffd166'
          ctx.lineWidth = 2
          ctx.stroke()
          // Rotation stalk: drag its head to turn the placement.
          const a = ((p.yawDeg - 90) * Math.PI) / 180
          const hx = at.x + Math.cos(a) * STALK_PX
          const hy = at.y + Math.sin(a) * STALK_PX
          ctx.beginPath()
          ctx.moveTo(at.x, at.y)
          ctx.lineTo(hx, hy)
          ctx.strokeStyle = '#ffd166'
          ctx.lineWidth = 2
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(hx, hy, 5, 0, Math.PI * 2)
          ctx.fillStyle = '#ffd166'
          ctx.fill()
        }
      }

      // Where the player is standing, so the plan and the world agree.
      poleInPlanetSpace(controlsRuntime.planetQuaternion, _pole)
      const plat = 90 - (Math.acos(THREE.MathUtils.clamp(_pole.y, -1, 1)) * 180) / Math.PI
      const plong = ((Math.atan2(_pole.x, _pole.z) * 180) / Math.PI + 360) % 360
      const me = project(v, plat, plong)
      ctx.beginPath()
      ctx.arc(me.x, me.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#14262b'
      ctx.lineWidth = 1.5
      ctx.fill()
      ctx.stroke()

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ---- input ---------------------------------------------------------
  const local = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = local(e)
    const s = usePlacementRuntime.getState()
    moved.current = false
    e.currentTarget.setPointerCapture(e.pointerId)

    // The rotation stalk of the current selection wins over everything.
    const sel = s.list.find((p) => p.id === s.selectedId)
    if (sel) {
      const at = project(viewRef.current, sel.lat, sel.long)
      const a = ((sel.yawDeg - 90) * Math.PI) / 180
      const hx = at.x + Math.cos(a) * STALK_PX
      const hy = at.y + Math.sin(a) * STALK_PX
      if (Math.hypot(hx - x, hy - y) <= 8) {
        drag.current = { kind: 'rotate', id: sel.id }
        return
      }
    }

    const hit = hitTest(x, y)
    if (hit) {
      s.select(hit.id)
      drag.current = { kind: 'move', id: hit.id }
      return
    }
    drag.current = {
      kind: 'pan',
      fromX: x,
      fromY: y,
      panX: viewRef.current.panX,
      panY: viewRef.current.panY,
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (d.kind === 'none') return
    const { x, y } = local(e)
    const s = usePlacementRuntime.getState()
    // The undo snapshot belongs to the first real movement — a plain
    // click to select must not leave a step on the stack.
    if (!moved.current && (d.kind === 'move' || d.kind === 'rotate')) s.startMove()
    moved.current = true
    if (d.kind === 'move') {
      const at = unproject(viewRef.current, x, y)
      s.moveTo(d.id, at.lat, at.long)
    } else if (d.kind === 'rotate') {
      const p = s.list.find((q) => q.id === d.id)
      if (!p) return
      const c = project(viewRef.current, p.lat, p.long)
      const deg = (Math.atan2(y - c.y, x - c.x) * 180) / Math.PI + 90
      const next = e.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg * 10) / 10
      s.rotate(d.id, next - p.yawDeg)
    } else {
      setView((v) => ({ ...v, panX: d.panX + (x - d.fromX), panY: d.panY + (y - d.fromY) }))
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    const { x, y } = local(e)
    const s = usePlacementRuntime.getState()
    if (moved.current && (d.kind === 'move' || d.kind === 'rotate')) s.endMove()
    if (!moved.current && d.kind === 'pan') {
      // A click on open ground: place if a brush is armed, else clear.
      if (s.brush) {
        const at = unproject(viewRef.current, x, y)
        s.add(s.brush, at.lat, at.long)
        s.setBrush(null)
      } else {
        s.select(null)
      }
    }
    drag.current = { kind: 'none' }
  }

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setView((v) => {
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      const scale = Math.max(1.2, Math.min(40, v.scale * factor))
      // Keep whatever is under the cursor under the cursor.
      const k = scale / v.scale
      return {
        ...v,
        scale,
        panX: x - v.cx - (x - v.cx - v.panX) * k - (v.cx - v.cx),
        panY: y - v.cy - (y - v.cy - v.panY) * k,
      }
    })
  }

  return (
    <div className="pointer-events-auto fixed bottom-4 left-4 z-50 rounded-xl bg-ink/95 p-2 shadow-2xl">
      <div className="mb-1 flex items-center gap-2 px-1 font-display text-[11px] text-sand/70">
        <span className="font-bold text-sand">Plan view</span>
        <span>drag to move · stalk to turn · wheel zooms · drag empty space to pan</span>
        <button
          type="button"
          onClick={() => setView((v) => ({ ...v, panX: 0, panY: 0, scale: SIZE / 2 / 80 }))}
          className="ml-auto rounded bg-sand/10 px-1.5 py-0.5 hover:bg-sand/20"
        >
          fit
        </button>
      </div>
      <canvas
        ref={canvasRef}
        data-map-editor
        width={SIZE}
        height={SIZE}
        style={{ width: SIZE, height: SIZE, touchAction: 'none', cursor: 'crosshair' }}
        className="rounded-lg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      />
    </div>
  )
}
