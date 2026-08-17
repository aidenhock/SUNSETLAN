import { buildLogChapters, type BuildLogChapter } from './buildLog'

/**
 * The room's walls: a framed screenshot per feature, each tied to a
 * chapter of the build log. Walking up to a mural and pressing E opens
 * that chapter — the screenshot is the hook, the chapter is the answer.
 *
 * A mural can carry SEVERAL shots when one frame can't show the whole
 * feature (the two skies, the sun's arc, the map inside and outside the
 * room). The wall shows the first; the modal pages through the rest
 * with arrows, each with its own caption.
 *
 * Room space is metres, origin at the rift in the centre, +X east,
 * +Z toward the entrance (south). Walls stand at x = ±18, z = ±12.
 * `at` is the mural's position ON the wall; `faceYaw` turns it inward.
 *
 * Screenshots live in `public/murals/` and are captured by
 * `node scripts/capture-murals.mjs` — rerun it when the world's look
 * changes, and the room updates itself. File names here must match what
 * that script writes (`<id>-<n>.jpg`); a vitest case checks that every
 * declared shot exists on disk, so a missing capture fails the suite
 * instead of hanging an empty frame on the wall.
 */

export interface MuralShot {
  /** File name under public/murals/. */
  file: string
  /** What this particular frame is showing. */
  caption: string
}

export interface Mural {
  id: string
  /** Wall position [x, z] in room metres. */
  at: [number, number]
  /** Yaw so the image faces into the room. */
  faceYaw: number
  /** Chapter this mural explains. */
  chapterId: string
  /** Short title, used by the E prompt. */
  caption: string
  shots: MuralShot[]
}

const NORTH = 0 // wall at z = -12, faces +z
const SOUTH = Math.PI // wall at z = +12, faces -z
const EAST = -Math.PI / 2 // wall at x = +18, faces -x
const WEST = Math.PI / 2 // wall at x = -18, faces +x

export const murals: Mural[] = [
  {
    id: 'fixed-pole',
    at: [-13, -12],
    faceYaw: NORTH,
    chapterId: 'fixed-pole',
    caption: 'The world turns, you do not',
    shots: [
      { file: 'fixed-pole-1.jpg', caption: 'Spawn: standing at the top of the world' },
      { file: 'fixed-pole-2.jpg', caption: 'Half a world later — same spot, different ground' },
    ],
  },
  {
    id: 'two-skies',
    at: [-4.5, -12],
    faceYaw: NORTH,
    chapterId: 'two-skies',
    caption: 'Two skies on one planet',
    shots: [
      { file: 'two-skies-1.jpg', caption: 'The sunset side, longitude 0' },
      { file: 'two-skies-2.jpg', caption: 'The night side, longitude 180' },
      { file: 'two-skies-3.jpg', caption: 'The terminator, where the two meet' },
    ],
  },
  {
    id: 'celestial-arc',
    at: [4.5, -12],
    faceYaw: NORTH,
    chapterId: 'celestial-arc',
    caption: 'The sun actually sets',
    shots: [
      { file: 'celestial-arc-1.jpg', caption: 'High over the plateau' },
      { file: 'celestial-arc-2.jpg', caption: 'Half-sunk at the waterline' },
    ],
  },
  {
    id: 'glitter',
    at: [13, -12],
    faceYaw: NORTH,
    chapterId: 'glitter',
    caption: 'A glitter path that follows you',
    shots: [
      { file: 'glitter-1.jpg', caption: 'The sun lane, from the beach' },
      { file: 'glitter-2.jpg', caption: 'The moon lane, night side' },
    ],
  },
  {
    id: 'character-rig',
    at: [-18, -6],
    faceYaw: WEST,
    chapterId: 'character-rig',
    caption: 'A villager from spheres and math',
    shots: [
      { file: 'character-rig-1.jpg', caption: 'Aiden, built from primitives' },
      { file: 'character-rig-2.jpg', caption: 'Mid-run — procedural animation, no clips' },
    ],
  },
  {
    id: 'audio',
    at: [-18, 6],
    faceYaw: WEST,
    chapterId: 'audio',
    caption: 'Sound that starts from silence',
    shots: [
      { file: 'audio-1.jpg', caption: 'Koa playing at the end of the dock' },
      { file: 'audio-2.jpg', caption: 'The campfire, crackling on proximity' },
    ],
  },
  {
    id: 'memorial-garden',
    at: [18, -6],
    faceYaw: EAST,
    chapterId: 'memorial-garden',
    caption: 'The memorial garden',
    shots: [
      { file: 'memorial-garden-1.jpg', caption: 'The gate, from the path' },
      { file: 'memorial-garden-2.jpg', caption: 'Fireflies and lantern light after dark' },
      { file: 'memorial-garden-3.jpg', caption: 'The whole plot from above' },
    ],
  },
  {
    id: 'minimap',
    at: [18, 6],
    faceYaw: EAST,
    chapterId: 'minimap',
    caption: 'The minimap',
    shots: [
      { file: 'minimap-1.jpg', caption: 'The island, centred on you' },
      { file: 'minimap-2.jpg', caption: 'The same window, inside this room' },
    ],
  },
  {
    id: 'hedge-stone',
    at: [-13, 12],
    faceYaw: SOUTH,
    chapterId: 'hedge-stone',
    caption: 'The moai',
    shots: [
      { file: 'hedge-stone-1.jpg', caption: 'Face on' },
      { file: 'hedge-stone-2.jpg', caption: 'From behind — you can walk all the way round' },
    ],
  },
  {
    id: 'one-terrain',
    at: [-4.5, 12],
    faceYaw: SOUTH,
    chapterId: 'one-terrain',
    caption: 'One continuous terrain',
    shots: [
      { file: 'one-terrain-1.jpg', caption: 'Grass to sand to sea, no seam' },
      { file: 'one-terrain-2.jpg', caption: 'Wading — the slope keeps going under water' },
    ],
  },
  {
    id: 'bulletin-board',
    at: [4.5, 12],
    faceYaw: SOUTH,
    chapterId: 'bulletin-board',
    caption: 'The bulletin board',
    shots: [
      { file: 'bulletin-board-1.jpg', caption: 'The board on the grass' },
      { file: 'bulletin-board-2.jpg', caption: 'What it opens' },
    ],
  },
  {
    id: 'budgets',
    at: [13, 12],
    faceYaw: SOUTH,
    chapterId: 'budgets',
    caption: 'Why draw calls beat triangles',
    shots: [
      { file: 'budgets-1.jpg', caption: 'The night side, well under the draw budget' },
      { file: 'budgets-2.jpg', caption: 'The whole island from out over the water' },
    ],
  },
]

export const muralImage = (file: string) => `/murals/${file}`

/** The shot hung on the wall itself. */
export const muralCover = (m: Mural) => muralImage(m.shots[0].file)

export function muralChapter(id: string): BuildLogChapter | undefined {
  const m = murals.find((x) => x.id === id)
  return m && buildLogChapters.find((c) => c.id === m.chapterId)
}
