import { buildLogChapters, type BuildLogChapter } from './buildLog'

/**
 * The room's walls: one framed screenshot set per chapter of the build
 * log, hung in the order the work actually happened. Step 1 is the
 * first thing to the left on the wall you face when you arrive, and the
 * sequence runs clockwise around the room from there, so walking the
 * perimeter walks the history. Each frame carries its step number.
 *
 * The ORDER IS NOT EDITABLE HERE: it comes from the chapter's position
 * in docs/build-log.md, which is the record of what was built when.
 * Reorder that file and the room re-hangs itself.
 *
 * A mural can carry SEVERAL shots when one frame can't show the whole
 * feature (the two skies, the sun's arc, the map inside and outside the
 * room). The wall shows the first; the modal pages through the rest
 * with arrows, each with its own caption.
 *
 * Screenshots live in `public/murals/` and are captured by
 * `node scripts/capture-murals.mjs` — rerun it when the world's look
 * changes, and the room updates itself. File names must match what that
 * script writes (`<id>-<n>.jpg`); vitest checks declared shots against
 * the folder in BOTH directions, so a missing capture fails the suite
 * instead of hanging an empty frame on the wall.
 */

export interface MuralShot {
  /** File name under public/murals/. */
  file: string
  /** What this particular frame is showing. */
  caption: string
}

/** What an author writes: the pictures and which chapter they explain. */
interface MuralDef {
  id: string
  chapterId: string
  /** Short title, used by the E prompt and under the frame. */
  caption: string
  shots: MuralShot[]
}

export interface Mural extends MuralDef {
  /** Implementation step — the chapter's position in the build log. */
  step: number
  /** Wall position [x, z] in room metres, derived from `step`. */
  at: [number, number]
  /** Yaw so the image faces into the room. */
  faceYaw: number
}

const DEFS: MuralDef[] = [
  {
    id: 'fixed-pole',
    chapterId: 'fixed-pole',
    caption: 'The world turns, you do not',
    shots: [
      { file: 'fixed-pole-1.jpg', caption: 'Spawn: standing at the top of the world' },
      { file: 'fixed-pole-2.jpg', caption: 'Half a world later — same spot, different ground' },
    ],
  },
  {
    id: 'analytic-ground',
    chapterId: 'analytic-ground',
    caption: 'Ground without physics',
    shots: [
      { file: 'analytic-ground-1.jpg', caption: 'The dock: a walkable strip, solved not simulated' },
      { file: 'analytic-ground-2.jpg', caption: 'Every prop sits exactly on the ground it computes' },
    ],
  },
  {
    id: 'one-terrain',
    chapterId: 'one-terrain',
    caption: 'One continuous terrain',
    shots: [
      { file: 'one-terrain-1.jpg', caption: 'Grass to sand to sea, no seam' },
      { file: 'one-terrain-2.jpg', caption: 'Wading — the slope keeps going under water' },
    ],
  },
  {
    id: 'two-skies',
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
    chapterId: 'celestial-arc',
    caption: 'The sun actually sets',
    shots: [
      { file: 'celestial-arc-1.jpg', caption: 'High over the plateau' },
      { file: 'celestial-arc-2.jpg', caption: 'Half-sunk at the waterline' },
    ],
  },
  {
    id: 'glitter',
    chapterId: 'glitter',
    caption: 'A glitter path that follows you',
    shots: [
      { file: 'glitter-1.jpg', caption: 'The sun lane, from the beach' },
      { file: 'glitter-2.jpg', caption: 'The moon lane, night side' },
    ],
  },
  {
    id: 'character-rig',
    chapterId: 'character-rig',
    caption: 'A villager from spheres and math',
    shots: [
      { file: 'character-rig-1.jpg', caption: 'Aiden, built from primitives' },
      { file: 'character-rig-2.jpg', caption: 'Mid-run — procedural animation, no clips' },
    ],
  },
  {
    id: 'audio',
    chapterId: 'audio',
    caption: 'Sound that starts from silence',
    shots: [
      { file: 'audio-1.jpg', caption: 'Koa playing at the end of the dock' },
      { file: 'audio-2.jpg', caption: 'The campfire, crackling on proximity' },
    ],
  },
  {
    id: 'budgets',
    chapterId: 'budgets',
    caption: 'Why draw calls beat triangles',
    shots: [
      { file: 'budgets-1.jpg', caption: 'The night side, well under the draw budget' },
      { file: 'budgets-2.jpg', caption: 'The whole island from out over the water' },
    ],
  },
  {
    id: 'content-pipeline',
    chapterId: 'content-pipeline',
    caption: 'Content without touching the scene',
    shots: [
      { file: 'content-pipeline-1.jpg', caption: 'The photo gallery, straight from a content file' },
      { file: 'content-pipeline-2.jpg', caption: 'The same content on the classic site' },
    ],
  },
  {
    id: 'hedge-stone',
    chapterId: 'hedge-stone',
    caption: 'The moai',
    shots: [
      { file: 'hedge-stone-1.jpg', caption: 'Face on' },
      { file: 'hedge-stone-2.jpg', caption: 'From behind — you can walk all the way round' },
    ],
  },
  {
    id: 'bulletin-board',
    chapterId: 'bulletin-board',
    caption: 'The bulletin board',
    shots: [
      { file: 'bulletin-board-1.jpg', caption: 'The board on the grass' },
      { file: 'bulletin-board-2.jpg', caption: 'What it opens' },
    ],
  },
  {
    id: 'minimap',
    chapterId: 'minimap',
    caption: 'The minimap',
    shots: [
      { file: 'minimap-1.jpg', caption: 'The island, centred on you' },
      { file: 'minimap-2.jpg', caption: 'The same window, inside this room' },
    ],
  },
  {
    id: 'memorial-garden',
    chapterId: 'memorial-garden',
    caption: 'The memorial garden',
    shots: [
      { file: 'memorial-garden-1.jpg', caption: 'The gate, from the path' },
      { file: 'memorial-garden-2.jpg', caption: 'Fireflies and lantern light after dark' },
      { file: 'memorial-garden-3.jpg', caption: 'The whole plot from above' },
    ],
  },
  {
    id: 'matrix-room',
    chapterId: 'matrix-room',
    caption: 'This room',
    shots: [
      { file: 'matrix-room-1.jpg', caption: 'The rift, out on the night-side grass' },
      { file: 'matrix-room-2.jpg', caption: 'Where you are standing right now' },
    ],
  },
  {
    id: 'self-hosted-fonts',
    chapterId: 'self-hosted-fonts',
    caption: 'Making the type real',
    shots: [
      { file: 'self-hosted-fonts-1.jpg', caption: 'The classic site, in its actual typefaces' },
    ],
  },
  {
    id: 'world-index',
    chapterId: 'world-index',
    caption: 'The world index',
    shots: [
      { file: 'world-index-1.jpg', caption: 'Everything on the island, from above' },
      { file: 'world-index-2.jpg', caption: 'Every monument, labelled on the map' },
    ],
  },
]

/**
 * Where each mural hangs. Slots are dealt clockwise starting at the
 * north wall's west end — the wall you face when you arrive — so the
 * step order reads left to right, then round the room. Walls take
 * murals in proportion to their length (largest-remainder), which means
 * adding a chapter re-flows the whole room instead of overflowing one
 * wall.
 */
const HALF_X = 18
const HALF_Z = 12
const EDGE_MARGIN = 3.5

const NORTH = 0 // wall at z = -12, faces +z
const SOUTH = Math.PI // wall at z = +12, faces -z
const EAST = -Math.PI / 2 // wall at x = +18, faces -x
const WEST = Math.PI / 2 // wall at x = -18, faces +x

/** Clockwise from the north wall; `along` walks the wall's own axis. */
const WALLS = [
  { faceYaw: NORTH, length: HALF_X * 2, at: (t: number): [number, number] => [t, -HALF_Z] },
  { faceYaw: EAST, length: HALF_Z * 2, at: (t: number): [number, number] => [HALF_X, t] },
  { faceYaw: SOUTH, length: HALF_X * 2, at: (t: number): [number, number] => [-t, HALF_Z] },
  { faceYaw: WEST, length: HALF_Z * 2, at: (t: number): [number, number] => [-HALF_X, -t] },
]

/** Split `count` murals across the walls, longest walls first. */
function share(count: number): number[] {
  const total = WALLS.reduce((s, w) => s + w.length, 0)
  const exact = WALLS.map((w) => (w.length / total) * count)
  const taken = exact.map(Math.floor)
  let left = count - taken.reduce((a, b) => a + b, 0)
  const byRemainder = exact
    .map((e, i) => ({ i, r: e - Math.floor(e) }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
  for (const { i } of byRemainder) {
    if (left <= 0) break
    taken[i]++
    left--
  }
  return taken
}

function layout(count: number): Array<{ at: [number, number]; faceYaw: number }> {
  const perWall = share(count)
  const slots: Array<{ at: [number, number]; faceYaw: number }> = []
  WALLS.forEach((wall, wi) => {
    const n = perWall[wi]
    const usable = wall.length - EDGE_MARGIN * 2
    for (let i = 0; i < n; i++) {
      // One mural centres; more spread evenly across the usable span.
      const t = n === 1 ? 0 : -usable / 2 + (usable / (n - 1)) * i
      slots.push({ at: wall.at(t), faceYaw: wall.faceYaw })
    }
  })
  return slots
}

const chapterStep = (chapterId: string) =>
  buildLogChapters.find((c) => c.id === chapterId)?.step ?? Number.MAX_SAFE_INTEGER

const ordered = [...DEFS].sort((a, b) => chapterStep(a.chapterId) - chapterStep(b.chapterId))
const SLOTS = layout(ordered.length)

export const murals: Mural[] = ordered.map((def, i) => ({
  ...def,
  step: chapterStep(def.chapterId),
  at: SLOTS[i].at,
  faceYaw: SLOTS[i].faceYaw,
}))

export const muralImage = (file: string) => `/murals/${file}`

/** The shot hung on the wall itself. */
export const muralCover = (m: Mural) => muralImage(m.shots[0].file)

export function muralChapter(id: string): BuildLogChapter | undefined {
  const m = murals.find((x) => x.id === id)
  return m && buildLogChapters.find((c) => c.id === m.chapterId)
}

export const muralForChapter = (chapterId: string) => murals.find((m) => m.chapterId === chapterId)
