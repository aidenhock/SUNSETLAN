import type { InteractableDef } from '../../content/interactables'
import { memorials } from '../../content/memorials'
import { ModalShell } from './ModalShell'

/**
 * A memorial stone (TASK 3): deliberately QUIET — softer serif-leaning
 * type, muted ink, no bright chrome. Placeholder entries carry a
 * gentle note instead of pretending to be real.
 */
export function MemorialModal({ def }: { def: InteractableDef }) {
  const m = memorials.find((entry) => entry.id === def.contentKey)
  if (!m) return null
  return (
    <ModalShell title={m.name}>
      <div className="space-y-3 text-ink/80">
        {m.years && <p className="font-display text-sm tracking-wide text-ink/60">{m.years}</p>}
        <p className="text-sm text-ink/60 italic">{m.relation}</p>
        {m.photo && (
          <img
            src={m.photo}
            alt={`Photo of ${m.name}`}
            loading="lazy"
            className="max-h-56 rounded-lg object-contain"
          />
        )}
        <p className="leading-loose">{m.message}</p>
        {m.placeholder && (
          <p className="border-t border-ink/10 pt-3 text-xs text-ink/50">
            A placeholder stone — the real remembrance is still being written.
          </p>
        )}
      </div>
    </ModalShell>
  )
}
