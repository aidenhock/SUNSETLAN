import { buildLogChapters, type BuildLogChapter } from './buildLog'

/**
 * The room's walls: one framed screenshot per feature, each tied to a
 * chapter of the build log. Walking up to a mural and pressing E opens
 * that chapter — the screenshot is the hook, the chapter is the answer.
 *
 * Room space is metres, origin at the rift in the centre, +X east,
 * +Z toward the entrance (south). Walls stand at x = ±18, z = ±12.
 * `at` is the mural's position ON the wall; `faceYaw` turns it inward.
 *
 * Screenshots live in `public/murals/` and are captured by
 * `node scripts/capture-murals.mjs` — rerun it when the world's look
 * changes, and the room updates itself.
 */

export interface Mural {
  id: string
  /** Wall position [x, z] in room metres. */
  at: [number, number]
  /** Yaw so the image faces into the room. */
  faceYaw: number
  /** Chapter this mural explains. */
  chapterId: string
  /** Short caption under the frame. */
  caption: string
}

const NORTH = 0 // wall at z = -12, faces +z
const SOUTH = Math.PI // wall at z = +12, faces -z
const EAST = -Math.PI / 2 // wall at x = +18, faces -x
const WEST = Math.PI / 2 // wall at x = -18, faces +x

export const murals: Mural[] = [
  { id: 'fixed-pole', at: [-13, -12], faceYaw: NORTH, chapterId: 'fixed-pole', caption: 'The world turns, you do not' },
  { id: 'two-skies', at: [-4.5, -12], faceYaw: NORTH, chapterId: 'two-skies', caption: 'Two skies on one planet' },
  { id: 'celestial-arc', at: [4.5, -12], faceYaw: NORTH, chapterId: 'celestial-arc', caption: 'The sun actually sets' },
  { id: 'glitter', at: [13, -12], faceYaw: NORTH, chapterId: 'glitter', caption: 'A glitter path that follows you' },
  { id: 'character-rig', at: [-18, -6], faceYaw: WEST, chapterId: 'character-rig', caption: 'A villager from spheres and math' },
  { id: 'audio', at: [-18, 6], faceYaw: WEST, chapterId: 'audio', caption: 'Sound that starts from silence' },
  { id: 'memorial-garden', at: [18, -6], faceYaw: EAST, chapterId: 'memorial-garden', caption: 'The memorial garden' },
  { id: 'minimap', at: [18, 6], faceYaw: EAST, chapterId: 'minimap', caption: 'The minimap' },
  { id: 'hedge-stone', at: [-13, 12], faceYaw: SOUTH, chapterId: 'hedge-stone', caption: 'The moai' },
  { id: 'one-terrain', at: [-4.5, 12], faceYaw: SOUTH, chapterId: 'one-terrain', caption: 'One continuous terrain' },
  { id: 'bulletin-board', at: [4.5, 12], faceYaw: SOUTH, chapterId: 'bulletin-board', caption: 'The bulletin board' },
  { id: 'budgets', at: [13, 12], faceYaw: SOUTH, chapterId: 'budgets', caption: 'Why draw calls beat triangles' },
]

export const muralImage = (id: string) => `/murals/${id}.jpg`

export function muralChapter(id: string): BuildLogChapter | undefined {
  const m = murals.find((x) => x.id === id)
  return m && buildLogChapters.find((c) => c.id === m.chapterId)
}
