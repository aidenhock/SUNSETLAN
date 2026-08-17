import { useId, useState } from 'react'
import { buildLogChapters } from '../content/buildLog'
import { muralForChapter, muralImage } from '../content/murals'

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
  const chapter = buildLogChapters[index]

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

      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={atStart}
          className="rounded-lg border border-ink/20 bg-white px-3 py-1.5 text-sm font-semibold text-deepwater disabled:cursor-not-allowed disabled:opacity-40"
        >
          ‹ Previous
        </button>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(buildLogChapters.length - 1, i + 1))}
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
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {mural.shots.map((shot) => (
              <figure key={shot.file} className="overflow-hidden rounded-lg border border-ink/10 bg-white">
                <img
                  src={muralImage(shot.file)}
                  alt={shot.caption}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
                <figcaption className="p-2 text-xs text-ink/60">{shot.caption}</figcaption>
              </figure>
            ))}
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
