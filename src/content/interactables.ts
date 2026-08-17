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
  | 'papers'
  | 'memorial'
  | 'matrix'

/** Chunky primitive prop bodies built in scene/props.ts. */
export type PropKind = 'tripod' | 'mailbox' | 'stereo' | 'hedgestone' | 'bulletin' | 'headstone' | 'portal'

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
    id: 'papers',
    label: 'Papers',
    prompt: 'Read the board',
    // Corkboard on two posts; blocker sized to the posts' span.
    prop: 'bulletin',
    blockRadius: 0.9,
    position: place(MAP.bulletinBoard.lat, MAP.bulletinBoard.long),
    // Slight angle toward the walking approach (meridianYaw base).
    rotation: [0, 0.2, 0],
    modal: 'papers',
    contentKey: 'papers',
  },
  // Memorial garden headstones (TASK 3): the front row is
  // interactable; approach reads "E — Remember". Quiet space.
  ...[
    { id: 'memorial-1', lat: 46.5, long: 105.5 },
    { id: 'memorial-2', lat: 46.5, long: 107 },
    { id: 'memorial-3', lat: 46.5, long: 108.5 },
  ].map(({ id, lat, long }) => ({
    id,
    label: 'Remember',
    prompt: 'Remember',
    prop: 'headstone' as const,
    blockRadius: 0.5,
    position: place(lat, long),
    rotation: [0, 0, 0] as [number, number, number],
    modal: 'memorial' as const,
    contentKey: id,
  })),
  {
    id: 'matrix',
    // The HUD prompt shows `label` (PromptE), so it carries the verb.
    label: 'Step through',
    prompt: 'Step through the portal',
    // The archway IS the interactable; blocker traces the frame span.
    prop: 'portal',
    blockRadius: 1.2,
    position: place(MAP.matrixPortal.lat, MAP.matrixPortal.long),
    rotation: [0, 0, 0],
    modal: 'matrix',
    contentKey: 'buildLog',
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
