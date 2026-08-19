import { useEffect, useMemo, useRef, useState } from 'react'
import { drawMoonPhase, moonPhase, SYNODIC_DAYS } from '../../scene/moonPhase'
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

  // Stamped, not just dated: the phase moves through the evening.
  const stamp = new Date().toLocaleString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const dateIn = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
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
          <p className="text-sm text-ink/60">{stamp}</p>
        </div>

        {/* The legend: every number the drawing is made from. */}
        <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 rounded-lg border border-ink/10 bg-white/50 p-3 text-sm">
          <dt className="text-ink/60">Illumination</dt>
          <dd className="tabular-nums">{(phase.illumination * 100).toFixed(1)}%</dd>

          <dt className="text-ink/60">Age</dt>
          <dd className="tabular-nums">
            {phase.ageDays.toFixed(2)} days <span className="text-ink/50">since new</span>
          </dd>

          <dt className="text-ink/60">Through the cycle</dt>
          <dd className="tabular-nums">{(phase.cycle * 100).toFixed(1)}%</dd>

          <dt className="text-ink/60">Direction</dt>
          <dd>{phase.waxing ? 'Waxing — filling out' : 'Waning — thinning'}</dd>

          <dt className="text-ink/60">Next full moon</dt>
          <dd className="tabular-nums">
            {phase.daysToFull < 0.5
              ? 'tonight'
              : `in ${phase.daysToFull.toFixed(1)} days — ${dateIn(phase.daysToFull)}`}
          </dd>

          <dt className="text-ink/60">Next new moon</dt>
          <dd className="tabular-nums">
            {phase.daysToNew < 0.5
              ? 'tonight'
              : `in ${phase.daysToNew.toFixed(1)} days — ${dateIn(phase.daysToNew)}`}
          </dd>

          <dt className="text-ink/60">Lunation</dt>
          <dd className="tabular-nums">{SYNODIC_DAYS.toFixed(6)} days</dd>
        </dl>

        <details className="rounded-lg border border-ink/10 bg-white/40 p-3">
          <summary className="cursor-pointer font-display text-sm">
            What do these numbers mean?
          </summary>
          <dl className="mt-3 space-y-2 text-sm leading-relaxed text-ink/70">
            <div>
              <dt className="font-display text-ink/85">Illumination</dt>
              <dd>
                How much of the disc facing us is lit by the sun. 0% is a new moon (the lit
                side is turned away), 100% is full. It isn&apos;t the same as how far through
                the month you are — the number climbs slowly at the edges and fast through the
                middle, because you&apos;re seeing a sphere.
              </dd>
            </div>
            <div>
              <dt className="font-display text-ink/85">Age</dt>
              <dd>
                Days since the last new moon. It runs 0 to 29.53 and then starts over. Around
                7.4 days is a first quarter, 14.8 a full moon, 22.1 a last quarter.
              </dd>
            </div>
            <div>
              <dt className="font-display text-ink/85">Through the cycle</dt>
              <dd>
                The same thing as a percentage of one lunation, which is what the drawing above
                is actually built from: the shadow&apos;s edge is an ellipse whose width is the
                cosine of this angle.
              </dd>
            </div>
            <div>
              <dt className="font-display text-ink/85">Waxing and waning</dt>
              <dd>
                Waxing means growing toward full, and the lit edge is on the right from the
                northern hemisphere; waning means shrinking toward new, lit on the left. Which
                side you see it on flips if you&apos;re south of the equator.
              </dd>
            </div>
            <div>
              <dt className="font-display text-ink/85">Lunation</dt>
              <dd>
                One full cycle of phases, 29.530588853 days on average. It&apos;s longer than
                the moon&apos;s orbit (27.3 days) because the earth moves around the sun
                meanwhile, so the moon has to catch up to line the three of us back up.
              </dd>
            </div>
          </dl>
        </details>

        <p className="text-sm leading-relaxed text-ink/70">
          Aiden&apos;s photograph of the full moon, shaded to tonight&apos;s phase. The phase is
          worked out from the length of a lunation rather than fetched from anywhere — the
          island never phones home.
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
