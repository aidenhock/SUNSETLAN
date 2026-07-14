export type ModalKind =
  | 'gallery'
  | 'projects'
  | 'music'
  | 'videos'
  | 'contact'
  | 'card'

export interface InteractableDef {
  id: string
  label: string
  prompt: string
  /** Absent during the gray-box phase — placeholder geometry is used instead. */
  modelPath?: string
  position: [number, number, number]
  rotation: [number, number, number]
  modal: ModalKind
  contentKey: string
}

export const interactables: InteractableDef[] = [
  {
    id: 'about',
    label: 'About',
    prompt: 'Read the card',
    position: [0, 0.75, -6],
    rotation: [0, Math.PI / 8, 0],
    modal: 'card',
    contentKey: 'about',
  },
]
