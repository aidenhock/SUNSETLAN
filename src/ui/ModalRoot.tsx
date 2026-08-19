import { interactables } from '../content/interactables'
import { useStore } from '../store/useStore'
import { CardModal } from './modals/CardModal'
import { ContactModal } from './modals/ContactModal'
import { CoversModal } from './modals/CoversModal'
import { GalleryModal } from './modals/GalleryModal'
import { MemorialModal } from './modals/MemorialModal'
import { MuralModal } from './modals/MuralModal'
import { MusicModal } from './modals/MusicModal'
import { PaintingsModal } from './modals/PaintingsModal'
import { PapersModal } from './modals/PapersModal'
import { TelescopeModal } from './modals/TelescopeModal'
import { ProjectsModal } from './modals/ProjectsModal'
import { VideosModal } from './modals/VideosModal'

export function ModalRoot() {
  const openModalId = useStore((s) => s.openModalId)
  // Murals live in the room, not on the island, so they are keyed by a
  // prefixed id rather than an interactable definition.
  if (openModalId?.startsWith('mural:')) {
    return <MuralModal muralId={openModalId.slice('mural:'.length)} />
  }
  const def = interactables.find((i) => i.id === openModalId)
  if (!def) return null

  switch (def.modal) {
    case 'card':
      return <CardModal def={def} />
    case 'gallery':
      return <GalleryModal />
    case 'projects':
      return <ProjectsModal />
    case 'music':
      return <MusicModal />
    case 'videos':
      return <VideosModal />
    case 'contact':
      return <ContactModal />
    case 'papers':
      return <PapersModal />
    case 'telescope':
      return <TelescopeModal />
    case 'paintings':
      return <PaintingsModal />
    case 'covers':
      return <CoversModal />
    case 'memorial':
      return <MemorialModal def={def} />
    case 'matrix':
      // Never reached: openModal('rift') enters the room instead of
      // opening a dialog (see the store). Kept so the union stays total.
      return null
  }
}
