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

/** Chunky primitive prop bodies built in scene/props.ts. */
export type PropKind = 'tripod' | 'mailbox' | 'stereo' | 'hedgestone'

export interface InteractableDef {
  id: string
  label: string
  prompt: string
  /** Primitive prop body; absent → placeholder box. */
  prop?: PropKind
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
    prompt: 'Turn on the stereo',
    prop: 'stereo',
    blockRadius: 0.8,
    position: place(MAP.musicUkulele.lat, MAP.musicUkulele.long),
    rotation: [0, Math.PI / 6, 0],
    modal: 'music',
    contentKey: 'music',
  },
  {
    id: 'photos',
    label: 'Photos',
    prompt: 'Look through the camera',
    prop: 'tripod',
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
    prop: 'mailbox',
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
    prompt: 'Read the stone',
    // The moai IS the interactable. ONE snug blocker on the statue
    // itself (arms reach ±0.83 m) — no ring guards: the hedge is gone,
    // and invisible walls read as getting stuck on nothing. Walk
    // around it freely; the prompt fires from 2.5 m on any side.
    prop: 'hedgestone',
    blockRadius: 1.1,
    position: place(MAP.hedgeStone.lat, MAP.hedgeStone.long),
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
