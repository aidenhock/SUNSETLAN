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

/** Altitude 0.55 = on the grass cap, 0.35 = on sand, 0.5 = on the dock. */
const place = (lat: number, long: number, altitude: number) =>
  latLongToPosition(lat, long, PLANET_RADIUS, altitude)

export const interactables: InteractableDef[] = [
  {
    id: 'music',
    label: 'Music',
    prompt: 'Pick up the ukulele',
    position: place(83, 175, 0.55),
    rotation: [0, Math.PI / 6, 0],
    modal: 'music',
    contentKey: 'music',
  },
  {
    id: 'photos',
    label: 'Photos',
    prompt: 'Look through the camera',
    position: place(14, 90, 0.5),
    rotation: [0, -Math.PI / 2, 0],
    modal: 'gallery',
    contentKey: 'photos',
  },
  {
    id: 'contact',
    label: 'Contact',
    prompt: 'Open the mailbox',
    position: place(24, 90, 0.35),
    rotation: [0, -Math.PI / 2, 0],
    modal: 'contact',
    contentKey: 'contact',
  },
  {
    id: 'projects',
    label: 'Projects',
    prompt: 'Check the monitor',
    position: place(45, 0, 0.55),
    rotation: [0, Math.PI, 0],
    modal: 'projects',
    contentKey: 'projects',
  },
  {
    id: 'about',
    label: 'About',
    prompt: 'Grab the rings',
    position: place(55, 300, 0.55),
    rotation: [0, 0, 0],
    modal: 'card',
    contentKey: 'about',
  },
  {
    id: 'videos',
    label: 'Videos',
    prompt: 'Turn on the TV',
    position: place(35, 135, 0.35),
    rotation: [0, Math.PI / 3, 0],
    modal: 'videos',
    contentKey: 'videos',
  },
]
