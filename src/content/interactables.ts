import { latLongToPosition } from '../controls/planetMath'
import { groundAltitudeAt } from '../controls/terrain'
import { placement, placementYaw } from './placements'
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
  | 'telescope'
  | 'paintings'
  | 'covers'

/** Chunky primitive prop bodies built in scene/props.ts. */
export type PropKind =
  | 'tripod'
  | 'mailbox'
  | 'stereo'
  | 'hedgestone'
  | 'bulletin'
  | 'headstone'
  | 'portal'
  | 'telescope'
  | 'easel'
  | 'micstand'

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
    rotation: [0, placementYaw('music'), 0],
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
    rotation: [0, placementYaw('photos'), 0], // faces the sun, out over the water
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
    rotation: [0, placementYaw('contact'), 0],
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
    rotation: [0, placementYaw('papers'), 0],
    modal: 'papers',
    contentKey: 'papers',
  },
  // Memorial garden headstones (TASK 3): the front row is
  // interactable; approach reads "E — Remember". Quiet space.
  ...['memorial-1', 'memorial-2', 'memorial-3'].map((id) => ({
    id,
    label: 'Remember',
    prompt: 'Remember',
    prop: 'headstone' as const,
    blockRadius: 0.5,
    position: place(placement(id).lat, placement(id).long),
    rotation: [0, placementYaw(id), 0] as [number, number, number],
    modal: 'memorial' as const,
    contentKey: id,
  })),
  {
    id: 'rift',
    // The HUD prompt shows `label` (PromptE), so it carries the verb.
    label: 'Step through',
    prompt: 'Step through the rift',
    // The rift floats; its blocker keeps you from standing inside it.
    prop: 'portal',
    blockRadius: 1.2,
    position: place(MAP.matrixPortal.lat, MAP.matrixPortal.long, placement('rift').liftM ?? 0),
    rotation: [0, placementYaw('rift'), 0],
    modal: 'matrix',
    contentKey: 'buildLog',
  },
  {
    id: 'telescope',
    label: 'Look through it',
    prompt: 'Look through the telescope',
    prop: 'telescope',
    blockRadius: 0.6,
    position: place(placement('telescope').lat, placement('telescope').long),
    rotation: [0, placementYaw('telescope'), 0],
    modal: 'telescope',
    contentKey: 'telescope',
  },
  {
    id: 'projects',
    label: 'Projects',
    prompt: 'Check the monitor',
    position: place(MAP.palapa.lat, MAP.palapa.long),
    rotation: [0, placementYaw('projects'), 0],
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
    rotation: [0, placementYaw('about'), 0],
    modal: 'card',
    contentKey: 'about',
  },
  {
    id: 'videos',
    label: 'Videos',
    prompt: 'Turn on the TV',
    // "CRT TV on crate": the cube sits on the crate top (0.7 + sink back).
    position: place(placement('videos').lat, placement('videos').long, placement('videos').liftM ?? 0),
    rotation: [0, placementYaw('videos'), 0],
    modal: 'videos',
    contentKey: 'videos',
  },
  {
    id: 'paintings',
    // The HUD prompt shows `label` (PromptE), so it carries the verb —
    // short enough for the mobile thumb button, like the rift.
    label: 'Look at the paintings',
    prompt: 'Look at the paintings',
    prop: 'easel',
    blockRadius: 0.6,
    position: place(placement('paintings').lat, placement('paintings').long),
    rotation: [0, placementYaw('paintings'), 0],
    modal: 'paintings',
    contentKey: 'paintings',
  },
  {
    id: 'covers',
    label: 'Hear the covers',
    prompt: 'Hear the covers',
    prop: 'micstand',
    blockRadius: 0.6,
    position: place(placement('covers').lat, placement('covers').long),
    rotation: [0, placementYaw('covers'), 0],
    modal: 'covers',
    contentKey: 'covers',
  },
]
