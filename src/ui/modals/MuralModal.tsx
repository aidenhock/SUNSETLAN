import { useCallback, useEffect, useState } from 'react'
import { muralChapter, muralImage, murals } from '../../content/murals'
import { useStore } from '../../store/useStore'
import { ModalShell } from './ModalShell'

/**
 * What a mural says when you press E on it: its screenshots, then the
 * build-log chapter behind that feature — plain language first, then
 * how it works, the real code, and the dead ends.
 *
 * Features that need more than one frame to show (the two skies, the
 * sun's arc, the map inside and outside the room) carry several shots;
 * the arrows page through them, wrapping at both ends like the photo
 * gallery. Single-shot murals hide the controls entirely.
 */
export function MuralModal({ muralId }: { muralId: string }) {
  const mural = murals.find((m) => m.id === muralId)
  const chapter = muralChapter(muralId)
  const [idx, setIdx] = useState(0)
  const count = mural?.shots.length ?? 0

  const step = useCallback(
    (delta: number) => {
      if (count < 2) return
      setIdx((i) => (i + delta + count) % count)
    },
    [count],
  )

  // Arrow keys page the shots. Capture phase so the key never reaches
  // the world behind the modal.
  useEffect(() => {
    if (count < 2) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return
      e.preventDefault()
      e.stopPropagation()
      step(e.code === 'ArrowRight' ? 1 : -1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [count, step])

  // Keep the next/previous frames warm so paging doesn't flash.
  useEffect(() => {
    if (!mural || count < 2) return
    for (const d of [-1, 1]) {
      const img = new Image()
      img.src = muralImage(mural.shots[(idx + d + count) % count].file)
    }
  }, [mural, idx, count])

  if (!mural || !chapter) {
    // A mural pointing at a deleted chapter shouldn't take the room down.
    return (
      <ModalShell title="Missing chapter">
        <p className="text-ink/70">This mural has lost its chapter. It'll be back.</p>
      </ModalShell>
    )
  }

  const shot = mural.shots[idx]
  return (
    <ModalShell title={chapter.title}>
      <div className="space-y-4 text-ink/80">
        <figure className="space-y-2">
          <div className="relative">
            <img
              src={muralImage(shot.file)}
              alt={shot.caption}
              draggable={false}
              className="w-full rounded-lg border border-ink/10"
            />
            {count > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label="Previous picture"
                  className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-ink/70 px-3 py-2 text-lg leading-none text-sand hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-lagoon"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label="Next picture"
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-ink/70 px-3 py-2 text-lg leading-none text-sand hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-lagoon"
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
          {count > 1 && (
            <div className="flex gap-1.5">
              {mural.shots.map((s, i) => (
                <button
                  key={s.file}
                  type="button"
                  onClick={() => setIdx(i)}
                  aria-label={`Picture ${i + 1}: ${s.caption}`}
                  aria-current={i === idx}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i === idx ? 'bg-ink/70' : 'bg-ink/20 hover:bg-ink/40'
                  }`}
                />
              ))}
            </div>
          )}
        </figure>

        <p className="font-display text-lg text-ink">{chapter.hook}</p>
        <p className="whitespace-pre-line leading-relaxed">{chapter.plain}</p>

        <details className="rounded-lg border border-ink/10 bg-white/50 p-3">
          <summary className="cursor-pointer font-display text-sm">How it works</summary>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink/70">
            {chapter.technical}
          </p>
          {chapter.files.map((f) => (
            <div key={f.path} className="mt-3">
              <p className="font-mono text-xs text-ink/60">{f.path}</p>
              {f.excerpts.map((x) => (
                <pre
                  key={x.symbol}
                  className="mt-1 overflow-x-auto rounded bg-ink/90 p-2 font-mono text-[11px] leading-relaxed text-sand"
                >
                  {x.code}
                </pre>
              ))}
            </div>
          ))}
        </details>

        {chapter.decisions.length > 0 && (
          <div>
            <h3 className="font-display text-sm text-ink">Decisions & dead ends</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/70">
              {chapter.decisions.map((d, i) => (
                <li key={i} className="whitespace-pre-line">
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={() => useStore.getState().closeModal()}
          className="rounded-lg bg-ink px-3 py-1.5 font-display text-sm text-sand"
        >
          Back to the room
        </button>
      </div>
    </ModalShell>
  )
}
