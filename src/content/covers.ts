export interface Cover {
  id: string
  title: string
  /** Who wrote the original. */
  artist: string
  note?: string
  /** Locally hosted recording under public/covers/. */
  audio?: string
  /** External link (e.g. YouTube/SoundCloud) as an alternative to audio. */
  link?: string
}

/**
 * The mic stand's set list (and the /classic Covers section). PLACEHOLDER
 * entries ship so the system is demonstrable — Aiden replaces them with
 * real recordings. A plain <audio> element plays `audio` here — this
 * stays OUT of the game's positional audio buses (CLAUDE.md's audio
 * system), it's just a normal HTML player inside the modal/page.
 */
export const covers: Cover[] = [
  {
    id: 'cover-1',
    title: 'Untitled cover (placeholder)',
    artist: 'Original artist TBD',
    note: 'This slot is a placeholder — a real recording goes here.',
  },
  {
    id: 'cover-2',
    title: 'Untitled cover (placeholder)',
    artist: 'Original artist TBD',
    note: 'Replace this in src/content/covers.ts with a title, artist, and an audio file or link.',
  },
  {
    id: 'cover-3',
    title: 'Untitled cover (placeholder)',
    artist: 'Original artist TBD',
    note: 'The set list is warming up — recordings are on their way.',
  },
]
