import { cards } from '../../content/about'
import type { InteractableDef } from '../../content/interactables'
import { ModalShell } from './ModalShell'

export function CardModal({ def }: { def: InteractableDef }) {
  const content = cards[def.contentKey]
  if (!content) return null

  return (
    <ModalShell title={content.title}>
      <div className="space-y-3">
        {content.body.map((paragraph, i) => (
          <p key={i} className="leading-relaxed">
            {paragraph}
          </p>
        ))}
      </div>
    </ModalShell>
  )
}
