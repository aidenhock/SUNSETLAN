import { muralChapter, murals } from '../../content/murals'
import { PictureCarousel } from '../PictureCarousel'
import { useStore } from '../../store/useStore'
import { ModalShell } from './ModalShell'

/**
 * What a mural says when you press E on it: its pictures, then the
 * build-log chapter behind that feature — plain language first, then
 * how it works, the real code, and the dead ends.
 *
 * The picture viewer is `PictureCarousel`, shared with the classic
 * site's build log so the two surfaces can't drift.
 */
export function MuralModal({ muralId }: { muralId: string }) {
  const mural = murals.find((m) => m.id === muralId)
  const chapter = muralChapter(muralId)

  if (!mural || !chapter) {
    // A mural pointing at a deleted chapter shouldn't take the room down.
    return (
      <ModalShell title="Missing chapter">
        <p className="text-ink/70">This mural has lost its chapter. It'll be back.</p>
      </ModalShell>
    )
  }

  return (
    <ModalShell title={`${String(chapter.step).padStart(2, '0')} · ${chapter.title}`}>
      <div className="space-y-4 text-ink/80">
        <PictureCarousel shots={mural.shots} keyboard />
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
