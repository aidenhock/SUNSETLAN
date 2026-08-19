export interface Painting {
  id: string
  title: string
  /** e.g. "2023"; omit if unknown or not wanted. */
  year?: string
  /** e.g. "Acrylic on canvas". */
  medium?: string
  note?: string
  /** Photograph OF the painting — the modal frames it (chunky wood
   *  border, off-white mat) so a photo of a canvas reads as a canvas on
   *  a wall. Real entries: web-sized WebP through
   *  scripts/optimize-images.mjs into public/paintings/, same two-size
   *  pipeline as content/photos.ts (see the Photos section of
   *  CONTENT.md). Placeholder entries leave this ''. */
  image: string
  thumb?: string
  width?: number
  height?: number
  /** Marks demo entries; the modal renders them with a gentle note
   *  instead of a photo. */
  placeholder?: boolean
}

/**
 * The easel's gallery (and the /classic Paintings section). PLACEHOLDER
 * entries ship so the system is demonstrable — Aiden replaces them with
 * real ones once the paintings are photographed.
 */
export const paintings: Painting[] = [
  {
    id: 'painting-1',
    title: 'Untitled (placeholder)',
    note: 'This canvas is a placeholder. A real painting goes here once it has been photographed.',
    image: '',
    placeholder: true,
  },
  {
    id: 'painting-2',
    title: 'Untitled (placeholder)',
    note: 'Replace this in src/content/paintings.ts with a title, year, medium, and a photographed image.',
    image: '',
    placeholder: true,
  },
  {
    id: 'painting-3',
    title: 'Untitled (placeholder)',
    note: 'This frame is waiting — the gallery holds space until the real paintings arrive.',
    image: '',
    placeholder: true,
  },
]
