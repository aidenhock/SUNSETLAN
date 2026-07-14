import { interactables } from '../content/interactables'
import { useStore } from '../store/useStore'
import { CardModal } from './modals/CardModal'

export function ModalRoot() {
  const openModalId = useStore((s) => s.openModalId)
  const def = interactables.find((i) => i.id === openModalId)
  if (!def) return null

  switch (def.modal) {
    case 'card':
      return <CardModal def={def} />
    default:
      // Other modal kinds arrive in phase 2.
      return null
  }
}
