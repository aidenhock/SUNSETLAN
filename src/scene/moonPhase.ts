/**
 * Tonight's moon, computed rather than fetched.
 *
 * The obvious way to show "the real moon right now" is to pull an image
 * from an API. This project makes NO external requests at runtime —
 * that is why the fonts are self-hosted and the analytics stub ships
 * off — and a live fetch would also mean a third party seeing every
 * visitor, a CORS surface, and a telescope that shows a broken image
 * the day the endpoint moves.
 *
 * The phase itself is arithmetic, so there is nothing to fetch: the
 * synodic month is 29.530588853 days and we know when a new moon was.
 * That gives the illuminated fraction to within a few hours, which is
 * far finer than the eye can read off a disc. Pair it with Aiden's own
 * photograph and the telescope shows HIS moon, shaded to tonight.
 */

/** Mean length of one lunation, days. */
export const SYNODIC_DAYS = 29.530588853

/** A known new moon: 2000-01-06 18:14 UTC. */
const EPOCH_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)

export type PhaseName =
  | 'New moon'
  | 'Waxing crescent'
  | 'First quarter'
  | 'Waxing gibbous'
  | 'Full moon'
  | 'Waning gibbous'
  | 'Last quarter'
  | 'Waning crescent'

export interface MoonPhase {
  /** Days since the last new moon, 0 … 29.53. */
  ageDays: number
  /** 0 at new, 1 at full — the fraction of the disc that is lit. */
  illumination: number
  /** 0 = new, 0.5 = full, approaching 1 = new again. */
  cycle: number
  waxing: boolean
  name: PhaseName
}

export function moonPhase(now: Date = new Date()): MoonPhase {
  const days = (now.getTime() - EPOCH_NEW_MOON) / 86_400_000
  const ageDays = ((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS
  const cycle = ageDays / SYNODIC_DAYS
  const illumination = (1 - Math.cos(2 * Math.PI * cycle)) / 2
  const waxing = cycle < 0.5
  return { ageDays, illumination, cycle, waxing, name: phaseName(cycle) }
}

/** The eight names, each covering its slice of the cycle. */
function phaseName(cycle: number): PhaseName {
  // Quarters and the new/full moments get a narrow band of their own so
  // "first quarter" means roughly the day it is, not a whole week.
  const c = ((cycle % 1) + 1) % 1
  if (c < 0.02 || c >= 0.98) return 'New moon'
  if (c < 0.23) return 'Waxing crescent'
  if (c < 0.27) return 'First quarter'
  if (c < 0.48) return 'Waxing gibbous'
  if (c < 0.52) return 'Full moon'
  if (c < 0.73) return 'Waning gibbous'
  if (c < 0.77) return 'Last quarter'
  return 'Waning crescent'
}

/**
 * Draw the moon at a given phase into a canvas: the disc first (a
 * photograph if one is supplied, else a procedural stand-in with maria),
 * then the shadow.
 *
 * The terminator is an ellipse. Its horizontal semi-axis is
 * `R·|cos(2π·cycle)|`, and which side of the disc the shadow sits on —
 * and whether the ellipse adds to it or bites out of it — depends on
 * the quarter of the cycle. That is the whole trick.
 */
export function drawMoonPhase(
  ctx: CanvasRenderingContext2D,
  size: number,
  phase: MoonPhase,
  photo?: CanvasImageSource | null,
): void {
  const r = size / 2
  const cx = r
  const cy = r

  ctx.clearRect(0, 0, size, size)
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()

  if (photo) {
    ctx.drawImage(photo, 0, 0, size, size)
  } else {
    // Stand-in until the real photograph is dropped in: a pale disc with
    // a few maria, in the same greys the in-game moon uses.
    ctx.fillStyle = '#d9dce6'
    ctx.fillRect(0, 0, size, size)
    const maria: Array<[number, number, number, number]> = [
      [0.38, 0.36, 0.15, 0.11],
      [0.58, 0.3, 0.1, 0.08],
      [0.62, 0.55, 0.13, 0.1],
      [0.36, 0.6, 0.09, 0.07],
      [0.5, 0.72, 0.07, 0.05],
    ]
    ctx.fillStyle = '#b3b8c6'
    for (const [x, y, rx, ry] of maria) {
      ctx.beginPath()
      ctx.ellipse(x * size, y * size, rx * size, ry * size, 0.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // The shadow. Dark but not black: earthshine keeps the unlit part
  // faintly visible, and a pure silhouette reads as a hole.
  const k = Math.cos(2 * Math.PI * phase.cycle)
  const ellipseR = Math.abs(k) * r
  ctx.fillStyle = 'rgba(10, 13, 24, 0.93)'
  ctx.beginPath()
  // Half the disc is always dark; which half depends on waxing/waning.
  const start = phase.waxing ? Math.PI / 2 : -Math.PI / 2
  ctx.arc(cx, cy, r, start, start + Math.PI)
  // Then the terminator ellipse either extends that shadow across the
  // middle (crescent) or carves back out of it (gibbous).
  const gibbous = phase.illumination > 0.5
  ctx.ellipse(cx, cy, ellipseR, r, 0, start + Math.PI, start, gibbous)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
