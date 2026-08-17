import { useCallback, useEffect, useState } from 'react'
import { buildLogChapters } from '../../content/buildLog'
import { useStore } from '../../store/useStore'

/**
 * The Matrix room's DOM half (TASK 4): a terminal-green chapter
 * reader over the 3D rain, code-split with the scene. Enter fades in
 * from black; E / Esc / ✕ fade back out through the inner portal.
 * Chapters are the REAL build log (docs/build-log.md → JSON with
 * build-time code excerpts) — the making-of, rendered in-world.
 */
export default function MatrixRoom() {
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<'enter' | 'in' | 'leave'>('enter')
  const ch = buildLogChapters[idx]
  const last = buildLogChapters.length - 1

  const leave = useCallback(() => {
    setPhase((p) => (p === 'leave' ? p : 'leave'))
  }, [])

  useEffect(() => {
    if (phase === 'enter') {
      const t = setTimeout(() => setPhase('in'), 60)
      return () => clearTimeout(t)
    }
    if (phase === 'leave') {
      const t = setTimeout(() => useStore.getState().closeModal(), 380)
      return () => clearTimeout(t)
    }
  }, [phase])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowRight') setIdx((i) => Math.min(i + 1, last))
      else if (e.code === 'ArrowLeft') setIdx((i) => Math.max(i - 1, 0))
      else if (e.code === 'KeyE' || e.code === 'Escape') leave()
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [last, leave])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Build log"
      className="fixed inset-0 z-40 font-mono text-emerald-200"
    >
      {/* The reader panel, right side — the rain stays visible left. */}
      <div className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-emerald-400/30 bg-black/80 backdrop-blur-sm">
        <header className="flex items-center gap-3 border-b border-emerald-400/30 px-5 py-3 text-xs tracking-widest text-emerald-400/80">
          <span className="uppercase">Build log</span>
          <span aria-hidden>·</span>
          <span>
            {String(idx + 1).padStart(2, '0')}/{String(last + 1).padStart(2, '0')}
          </span>
          <label className="sr-only" htmlFor="matrix-chapter">
            Chapter
          </label>
          <select
            id="matrix-chapter"
            value={idx}
            onChange={(e) => setIdx(Number(e.target.value))}
            className="ml-auto max-w-[45%] truncate rounded border border-emerald-400/30 bg-black/60 px-2 py-1 text-emerald-200"
          >
            {buildLogChapters.map((c, i) => (
              <option key={c.id} value={i}>
                {String(i + 1).padStart(2, '0')} · {c.title}
              </option>
            ))}
          </select>
          <button
            onClick={leave}
            aria-label="Exit the room"
            className="rounded border border-emerald-400/40 px-2 py-1 text-emerald-300 hover:bg-emerald-400/10"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <h2 className="font-display text-2xl font-bold text-emerald-100">{ch.title}</h2>
          <p className="mt-2 text-emerald-300">{ch.hook}</p>
          <p className="mt-4 whitespace-pre-line leading-relaxed text-emerald-200/90">{ch.plain}</p>
          <h3 className="mt-6 text-xs uppercase tracking-widest text-emerald-400/70">Under the hood</h3>
          <p className="mt-2 whitespace-pre-line leading-relaxed text-emerald-200/70">
            {ch.technical}
          </p>

          {ch.files.length > 0 && (
            <>
              <h3 className="mt-6 text-xs uppercase tracking-widest text-emerald-400/70">
                The actual code
              </h3>
              {ch.files.map((f) => (
                <details key={f.path} className="mt-2 rounded border border-emerald-400/20">
                  <summary className="cursor-pointer px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-400/5">
                    {f.path}
                  </summary>
                  {f.excerpts.map((x) => (
                    <div key={x.symbol} className="border-t border-emerald-400/10 px-3 py-2">
                      <p className="text-xs text-emerald-400/70">
                        {x.symbol} · line {x.line}
                      </p>
                      <pre className="mt-1 overflow-x-auto text-xs leading-relaxed text-emerald-100/80">
                        {x.code}
                      </pre>
                    </div>
                  ))}
                </details>
              ))}
            </>
          )}

          {ch.decisions.length > 0 && (
            <>
              <h3 className="mt-6 text-xs uppercase tracking-widest text-emerald-400/70">
                Decisions & dead ends
              </h3>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-emerald-200/80">
                {ch.decisions.map((d, i) => (
                  <li key={i} className="whitespace-pre-line">
                    {d}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-emerald-400/30 px-5 py-3 text-xs text-emerald-400/80">
          <button
            onClick={() => setIdx((i) => Math.max(i - 1, 0))}
            disabled={idx === 0}
            aria-label="Previous chapter"
            className="rounded border border-emerald-400/40 px-3 py-1 text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-30"
          >
            ‹
          </button>
          <button
            onClick={() => setIdx((i) => Math.min(i + 1, last))}
            disabled={idx === last}
            aria-label="Next chapter"
            className="rounded border border-emerald-400/40 px-3 py-1 text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-30"
          >
            ›
          </button>
          <span className="ml-auto hidden sm:inline">← → chapters · E steps back through</span>
        </footer>
      </div>

      {/* Enter/exit fade — the portal transition itself. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-black transition-opacity ${
          phase === 'in' ? 'opacity-0 duration-700' : 'opacity-100 duration-300'
        }`}
      />
    </div>
  )
}
