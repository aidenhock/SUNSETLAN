import { papers } from '../../content/papers'
import { EmptyState } from './EmptyState'
import { ModalShell } from './ModalShell'

/**
 * The bulletin board: documents from content/papers.ts. View opens the
 * browser's own PDF viewer in a new tab and Download saves it — both
 * are plain links, so nothing is fetched until clicked (the lazy rule).
 */
export function PapersModal() {
  if (papers.length === 0) {
    return (
      <ModalShell title="Papers">
        <EmptyState
          icon="📌"
          headline="The board is bare"
          sub="Fresh pins are coming — the resume and papers land here soon."
        />
      </ModalShell>
    )
  }
  return (
    <ModalShell title="Papers">
      <ul className="space-y-4">
        {papers.map((paper) => (
          <li key={paper.id} className="rounded-xl border border-ink/10 p-4">
            <h3 className="font-display text-lg font-semibold">{paper.title}</h3>
            <p className="mt-1 leading-relaxed">{paper.blurb}</p>
            <p className="mt-3 flex gap-3 text-sm font-semibold">
              <a
                href={paper.file}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-lagoon px-3 py-1.5 font-display text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deepwater"
              >
                View
              </a>
              <a
                href={paper.file}
                download
                className="rounded-lg bg-lagoon/20 px-3 py-1.5 font-display text-deepwater focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deepwater"
              >
                Download
              </a>
            </p>
          </li>
        ))}
      </ul>
    </ModalShell>
  )
}
