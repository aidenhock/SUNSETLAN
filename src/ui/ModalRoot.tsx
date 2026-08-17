import { lazy, Suspense } from 'react'
import { interactables } from '../content/interactables'
import { useStore } from '../store/useStore'
import { CardModal } from './modals/CardModal'
import { ContactModal } from './modals/ContactModal'
import { GalleryModal } from './modals/GalleryModal'
/** The build-log reader — code-split with its scene half. */
const MatrixRoom = lazy(() => import('./modals/MatrixRoom'))
import { MemorialModal } from './modals/MemorialModal'
import { MusicModal } from './modals/MusicModal'
import { PapersModal } from './modals/PapersModal'
import { ProjectsModal } from './modals/ProjectsModal'
import { VideosModal } from './modals/VideosModal'

export function ModalRoot() {
  const openModalId = useStore((s) => s.openModalId)
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
    case 'memorial':
      return <MemorialModal def={def} />
    case 'matrix':
      return (
        <Suspense fallback={null}>
          <MatrixRoom />
        </Suspense>
      )
  }
}
