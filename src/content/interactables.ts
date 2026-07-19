import { latLongToPosition } from '../controls/planetMath'
import { groundAltitudeAt } from '../controls/terrain'
import { MAP, PLANET_RADIUS, SINK_M } from '../scene/planetConfig'

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
  /** Kit model; absent → placeholder box. */
  modelPath?: string
  /** Normalized model height in meters (default 1.2). */
  modelSize?: number
  /** Movement-blocking radius in meters of arc (default 1.2). */
  blockRadius?: number
  /** Planet-local position (lat 90 = spawn pole). */
  position: [number, number, number]
  rotation: [number, number, number]
  modal: ModalKind
  contentKey: string
}

/** Placement rule 1: altitude comes from the analytic ground, minus sink.
 *  `extra` raises objects that stand on furniture (e.g. the TV on its crate). */
const place = (lat: number, long: number, extra = 0) =>
  latLongToPosition(lat, long, PLANET_RADIUS, groundAltitudeAt(lat, long) - SINK_M + extra)

export const interactables: InteractableDef[] = [
  {
    id: 'music',
    label: 'Music',
    prompt: 'Pick up the ukulele',
    position: place(MAP.musicUkulele.lat, MAP.musicUkulele.long),
    rotation: [0, Math.PI / 6, 0],
    modal: 'music',
    contentKey: 'music',
  },
  {
    id: 'photos',
    label: 'Photos',
    prompt: 'Look through the camera',
    modelPath: '/models/tripod.glb',
    modelSize: 1.5,
    blockRadius: 0.7,
    position: place(MAP.tripod.lat, MAP.tripod.long),
    rotation: [0, Math.PI, 0], // faces the sun, out over the water
    modal: 'gallery',
    contentKey: 'photos',
  },
  {
    id: 'contact',
    label: 'Contact',
    prompt: 'Open the mailbox',
    modelPath: '/models/mailbox.glb',
    modelSize: 1.1,
    blockRadius: 0.6,
    position: place(MAP.mailbox.lat, MAP.mailbox.long),
    rotation: [0, Math.PI, 0],
    modal: 'contact',
    contentKey: 'contact',
  },
  {
    id: 'projects',
    label: 'Projects',
    prompt: 'Check the monitor',
    position: place(MAP.palapa.lat, MAP.palapa.long),
    rotation: [0, 0, 0],
    modal: 'projects',
    contentKey: 'projects',
  },
  {
    id: 'about',
    label: 'About',
    prompt: 'Grab the rings',
    // Beside the trunk, under the rings' branch — not inside the tree.
    position: place(MAP.tree.lat, MAP.tree.long - 2.5),
    rotation: [0, 0, 0],
    modal: 'card',
    contentKey: 'about',
  },
  {
    id: 'videos',
    label: 'Videos',
    prompt: 'Turn on the TV',
    // "CRT TV on crate": the cube sits on the crate top (0.7 + sink back).
    position: place(MAP.tv.lat, MAP.tv.long + 0.8, 0.8),
    rotation: [0, Math.PI / 3, 0],
    modal: 'videos',
    contentKey: 'videos',
  },
]
