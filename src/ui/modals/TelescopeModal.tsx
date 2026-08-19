import { useEffect, useMemo, useRef, useState } from 'react'
import { drawMoonPhase, moonPhase } from '../../scene/moonPhase'
import { ModalShell } from './ModalShell'

/**
 * What the telescope shows: the moon as it actually is tonight.
 *
 * The phase is computed, not fetched (see scene/moonPhase.ts for why),
 * and it is painted over Aiden's own photograph when that exists at
 * `/moon/moon.jpg` — the picture the in-game moon's maria were drawn
 * from. Until then the disc is drawn procedurally, and says so.
 */

const SIZE = 320
const PHOTO = '/moon/moon.jpg'

export function TelescopeModal() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null)
  const [checked, setChecked] = useState(false)
  const phase = useMemo(() => moonPhase(), [])

  // The photograph is optional: if it isn't there, the drawing falls
  // back to a procedural disc rather than showing a broken image.
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setPhoto(img)
      setChecked(true)
    }
    img.onerror = () => setChecked(true)
    img.src = PHOTO
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = SIZE * dpr
    canvas.height = SIZE * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawMoonPhase(ctx, SIZE, phase, photo)
  }, [phase, photo, checked])

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <ModalShell title="Through the telescope">
      <div className="space-y-4 text-ink/80">
        <div className="flex justify-center rounded-xl bg-ink/90 py-4">
          <canvas
            ref={canvasRef}
            style={{ width: SIZE, height: SIZE }}
            role="img"
            aria-label={`The moon tonight: ${phase.name}, ${Math.round(
              phase.illumination * 100,
            )} percent lit`}
          />
        </div>

        <div>
          <p className="font-display text-lg text-ink">{phase.name}</p>
          <p className="text-sm text-ink/60">{today}</p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink/60">Lit</dt>
          <dd className="tabular-nums">{Math.round(phase.illumination * 100)}%</dd>
          <dt className="text-ink/60">Age</dt>
          <dd className="tabular-nums">{phase.ageDays.toFixed(1)} days</dd>
          <dt className="text-ink/60">Heading</dt>
          <dd>{phase.waxing ? 'waxing — filling out' : 'waning — thinning'}</dd>
        </dl>

        <p className="text-sm leading-relaxed text-ink/70">
          This is the real phase for tonight, worked out from the length of a lunation rather
          than fetched from anywhere — the island never phones home.
        </p>

        {checked && !photo && (
          <p className="rounded-lg border border-ink/10 bg-white/50 p-3 text-xs leading-relaxed text-ink/60">
            The disc above is a stand-in. Drop Aiden's moon photograph — the one the maria on
            the island's own moon were drawn from — at <code>public/moon/moon.jpg</code> and the
            telescope will show it, shaded to tonight's phase.
          </p>
        )}
      </div>
    </ModalShell>
  )
}
