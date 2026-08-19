import { paintings } from '../../content/paintings'
import { EmptyState } from './EmptyState'
import { ModalShell } from './ModalShell'

/**
 * The easel's gallery: each photograph OF a painting sits inside a chunky
 * wooden frame with an off-white mat and a soft inner shadow, so a photo
 * of a canvas reads as a canvas on a wall — never a bare photo. Placeholder
 * entries render the same frame around a friendly note instead of an image.
 */
export function PaintingsModal() {
  if (paintings.length === 0) {
    return (
      <ModalShell title="Paintings" wide>
        <EmptyState
          icon="🎨"
          headline="The gallery wall is bare"
          sub="Paintings are on their way — check back soon."
        />
      </ModalShell>
    )
  }
  return (
    <ModalShell title="Paintings" wide>
      <div className="grid gap-6 sm:grid-cols-2">
        {paintings.map((p) => (
          <figure key={p.id}>
            <div className="rounded-sm border-[14px] border-[#8a6f47] bg-[#f5efdd] p-3 shadow-[inset_0_2px_10px_rgba(0,0,0,0.35)]">
              {p.placeholder || !p.image ? (
                <EmptyState
                  icon="🎨"
                  headline="Still being photographed"
                  sub={p.note ?? 'A real painting goes here soon.'}
                />
              ) : (
                <img
                  src={p.image}
                  alt={p.title}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
              )}
            </div>
            <figcaption className="mt-2 text-sm">
              <span className="font-display font-semibold">{p.title}</span>
              {(p.year || p.medium) && (
                <span className="block text-ink/60">
                  {[p.year, p.medium].filter(Boolean).join(' · ')}
                </span>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </ModalShell>
  )
}
