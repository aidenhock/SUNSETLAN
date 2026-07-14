import { latLongToPosition } from '../controls/planetMath'
import { PLANET_RADIUS } from '../scene/planetConfig'

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
  /** Planet-local position (use latLongToPosition; lat 90 = spawn pole). */
  position: [number, number, number]
  rotation: [number, number, number]
  modal: ModalKind
  contentKey: string
}

/** Interactables sit on the sand cap (radius + 0.35). */
const onSand = (lat: number, long: number) =>
  latLongToPosition(lat, long, PLANET_RADIUS, 0.35)

export const interactables: InteractableDef[] = [
  {
    id: 'about',
    label: 'About',
    prompt: 'Read the card',
    position: onSand(80, 180),
    rotation: [0, Math.PI / 8, 0],
    modal: 'card',
    contentKey: 'about',
  },
]
