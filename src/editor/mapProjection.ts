import { PLANET_RADIUS } from '../scene/planetConfig'

/**
 * The plan view's projection: north-up, island-centred, and INVERTIBLE —
 * which is the whole reason the editor draws its own map instead of
 * reusing the HUD's. The HUD map spins with the camera and is centred on
 * the player; for laying out a world you want the island to sit still so
 * a thing you drag stays where you dropped it.
 *
 * It is the plain azimuthal one: distance from the centre is the polar
 * angle (90 − lat), and the bearing is the longitude, with longitude 0 —
 * the sunset meridian — pointing up.
 */

export interface MapView {
  /** Canvas centre in pixels. */
  cx: number
  cy: number
  /** Pixels per degree of polar angle. */
  scale: number
  /** Pan offset in pixels. */
  panX: number
  panY: number
}

const DEG = Math.PI / 180

export function project(view: MapView, lat: number, long: number): { x: number; y: number } {
  const r = (90 - lat) * view.scale
  const a = long * DEG
  return {
    x: view.cx + view.panX + Math.sin(a) * r,
    y: view.cy + view.panY - Math.cos(a) * r,
  }
}

export function unproject(view: MapView, x: number, y: number): { lat: number; long: number } {
  const dx = x - view.cx - view.panX
  const dy = y - view.cy - view.panY
  const r = Math.hypot(dx, dy)
  return {
    lat: 90 - r / view.scale,
    long: ((Math.atan2(dx, -dy) / DEG) % 360 + 360) % 360,
  }
}

/** Metres → pixels, for drawing blocker radii at their true size. */
export const metresPerDegree = (Math.PI * PLANET_RADIUS) / 180
export const pxPerMetre = (view: MapView) => view.scale / metresPerDegree
