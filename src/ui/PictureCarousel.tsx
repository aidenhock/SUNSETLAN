import { useCallback, useEffect, useState } from 'react'
import type { MuralShot } from '../content/murals'
import { muralImage } from '../content/murals'
import { StepDots } from './StepDots'

/**
 * The picture viewer shared by the room's mural modal and the classic
 * site's build log — one component so the two surfaces can't drift
 * (the same reason `ContactForm` is shared).
 *
 * Arrows page through a feature's shots and wrap at both ends, each
 * frame keeps its own caption, neighbours preload so paging doesn't
 * flash, and the dots below light up as you look at them.
 */
export function PictureCarousel({
  shots,
  keyboard = false,
  aspect = 'aspect-[16/9]',
}: {
  shots: MuralShot[]
  /** Bind ← → globally. The modal wants this; a page section doesn't. */
  keyboard?: boolean
  aspect?: string
}) {
  const count = shots.length
  const [idx, setIdx] = useState(0)
  const [seen, setSeen] = useState<boolean[]>(() => shots.map((_, i) => i === 0))

  const go = useCallback(
    (next: number) => {
      const wrapped = (next + count) % count
      setIdx(wrapped)
      setSeen((prev) => {
        if (prev[wrapped]) return prev
        const copy = [...prev]
        copy[wrapped] = true
        return copy
      })
    },
    [count],
  )

  // A different mural (or chapter) reuses this component: start over.
  useEffect(() => {
    setIdx(0)
    setSeen(shots.map((_, i) => i === 0))
  }, [shots])

  useEffect(() => {
    if (!keyboard || count < 2) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return
      e.preventDefault()
      e.stopPropagation()
      go(idx + (e.code === 'ArrowRight' ? 1 : -1))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [keyboard, count, idx, go])

  // Keep the neighbours warm.
  useEffect(() => {
    if (count < 2) return
    for (const d of [-1, 1]) {
      const img = new Image()
      img.src = muralImage(shots[(idx + d + count) % count].file)
    }
  }, [shots, idx, count])

  if (count === 0) return null
  const shot = shots[idx]

  return (
    <figure className="space-y-2">
      <div className="relative">
        <img
          src={muralImage(shot.file)}
          alt={shot.caption}
          loading="lazy"
          draggable={false}
          className={`w-full rounded-lg border border-ink/10 bg-white object-cover ${aspect}`}
        />
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(idx - 1)}
              aria-label="Previous picture"
              className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-ink/70 px-3 py-2 text-lg leading-none text-sand transition-colors hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lagoon"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(idx + 1)}
              aria-label="Next picture"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-ink/70 px-3 py-2 text-lg leading-none text-sand transition-colors hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lagoon"
            >
              ›
            </button>
          </>
        )}
      </div>

      <figcaption className="flex items-center gap-3 text-sm text-ink/60">
        <span>{shot.caption}</span>
        {count > 1 && (
          <span className="ml-auto shrink-0 tabular-nums" aria-live="polite">
            {idx + 1} of {count}
          </span>
        )}
      </figcaption>

      <StepDots
        count={count}
        current={idx}
        seen={seen}
        onSelect={go}
        label="Pictures"
        itemLabel={(i) => `Picture ${i + 1}: ${shots[i].caption}`}
      />
    </figure>
  )
}
