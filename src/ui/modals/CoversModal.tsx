import { covers } from '../../content/covers'
import { EmptyState } from './EmptyState'
import { ModalShell } from './ModalShell'

export function CoversModal() {
  if (covers.length === 0) {
    return (
      <ModalShell title="Covers">
        <EmptyState
          icon="🎤"
          headline="The mic is still off"
          sub="Cover recordings are on their way — check back soon."
        />
      </ModalShell>
    )
  }
  return (
    <ModalShell title="Covers">
      <ul className="space-y-4">
        {covers.map((cover) => (
          <li key={cover.id}>
            <h3 className="font-display font-semibold">{cover.title}</h3>
            <p className="text-sm text-ink/60 italic">originally by {cover.artist}</p>
            {cover.note && <p className="mt-1 text-sm text-ink/70">{cover.note}</p>}
            {cover.audio ? (
              <audio controls src={cover.audio} className="mt-2 w-full" preload="none" />
            ) : cover.link ? (
              <a
                href={cover.link}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm font-semibold text-deepwater underline"
              >
                Listen
              </a>
            ) : (
              <p className="mt-1 text-sm text-ink/70">Recording coming soon.</p>
            )}
          </li>
        ))}
      </ul>
    </ModalShell>
  )
}
