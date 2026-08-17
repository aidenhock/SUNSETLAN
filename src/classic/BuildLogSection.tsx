import { useCallback, useEffect, useId, useState } from 'react'
import { buildLogChapters } from '../content/buildLog'
import { muralForChapter } from '../content/murals'
import { PictureCarousel } from '../ui/PictureCarousel'
import { StepDots } from '../ui/StepDots'

/** "01 · Title" — zero-padded step + a middle dot, shared by the select options and the article heading. */
function chapterLabel(ch: { step: number; title: string }): string {
  return `${String(ch.step).padStart(2, '0')} · ${ch.title}`
}

/**
 * Build log — dropdown chronology of docs/build-log.md chapters (already
 * step-ordered), with the same mural screenshots hung in the Matrix room
 * (mirror rule: /classic shows the same content, just not in 3D).
 */
export function BuildLogSection() {
  const selectId = useId()
  const [index, setIndex] = useState(0)
  // Chapters you've read this visit. Session only, by design: the log
  // is a story to walk through, not progress to grind for.
  const [seen, setSeen] = useState<boolean[]>(() =>
    buildLogChapters.map((_, i) => i === 0),
  )
  const chapter = buildLogChapters[index]

  const goTo = useCallback((next: number) => {
    setIndex(Math.max(0, Math.min(buildLogChapters.length - 1, next)))
  }, [])

  useEffect(() => {
    setSeen((prev) => {
      if (prev[index]) return prev
      const copy = [...prev]
      copy[index] = true
      return copy
    })
  }, [index])

  if (!chapter) {
    return (
      <section className="mt-12" aria-labelledby="buildlog-h">
        <h2 id="buildlog-h" className="font-display text-2xl font-bold">
          Build log
        </h2>
        <p className="mt-3 text-ink/70">The log is being written.</p>
      </section>
    )
  }

  const mural = muralForChapter(chapter.id)
  const atStart = index === 0
  const atEnd = index === buildLogChapters.length - 1

  return (
    <section className="mt-12" aria-labelledby="buildlog-h">
      <h2 id="buildlog-h" className="font-display text-2xl font-bold">
        Build log
      </h2>
      <p className="mt-1 text-sm text-ink/60">
        How this island was made — the same chapters the portal room renders in 3D.
      </p>

      <div className="mt-4">
        <label htmlFor={selectId} className="mb-1 block font-display text-sm font-semibold">
          Jump to a chapter
        </label>
        <select
          id={selectId}
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          className="w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm"
        >
          {buildLogChapters.map((ch, i) => (
            <option key={ch.id} value={i}>
              {chapterLabel(ch)}
            </option>
          ))}
        </select>
      </div>

      {/* The chapters you've been through light up, left to right. */}
      <StepDots
        count={buildLogChapters.length}
        current={index}
        seen={seen}
        onSelect={goTo}
        label="Build log progress"
        itemLabel={(i) => chapterLabel(buildLogChapters[i])}
      />

      <div className="mt-1 flex gap-3">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={atStart}
          className="rounded-lg border border-ink/20 bg-white px-3 py-1.5 text-sm font-semibold text-deepwater disabled:cursor-not-allowed disabled:opacity-40"
        >
          ‹ Previous
        </button>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          disabled={atEnd}
          className="rounded-lg border border-ink/20 bg-white px-3 py-1.5 text-sm font-semibold text-deepwater disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next ›
        </button>
      </div>

      <article className="mt-4 rounded-xl border border-ink/10 bg-white/60 p-4" aria-live="polite">
        <h3 className="font-display text-lg font-semibold">{chapterLabel(chapter)}</h3>
        <p className="mt-1 leading-relaxed text-ink/80">{chapter.hook}</p>
        <p className="mt-3 whitespace-pre-line leading-relaxed text-ink/70">{chapter.plain}</p>

        {mural && mural.shots.length > 0 && (
          <div className="mt-4">
            {/* Same viewer the room's murals use — arrows, captions, dots. */}
            <PictureCarousel key={mural.id} shots={mural.shots} />
          </div>
        )}

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-ink/60">How it works</summary>
          <p className="mt-2 whitespace-pre-line leading-relaxed text-sm text-ink/70">{chapter.technical}</p>
          {chapter.files.length > 0 && (
            <div className="mt-3 space-y-3">
              {chapter.files.map((file) => (
                <div key={file.path}>
                  <p className="font-mono text-xs font-semibold text-ink/70">{file.path}</p>
                  {file.excerpts.map((ex, i) => (
                    <pre
                      key={i}
                      className="mt-1 overflow-x-auto rounded-lg bg-ink/5 p-2 font-mono text-xs leading-snug text-ink/80"
                    >
                      <code>{ex.code}</code>
                    </pre>
                  ))}
                </div>
              ))}
            </div>
          )}
        </details>

        {chapter.decisions.length > 0 && (
          <div className="mt-4">
            <p className="font-display text-sm font-semibold">Decisions &amp; dead ends</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/70">
              {chapter.decisions.map((d, i) => (
                <li key={i} className="whitespace-pre-line">
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </section>
  )
}
