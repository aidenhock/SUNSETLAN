export interface Memorial {
  id: string
  name: string
  /** e.g. "2008 – 2023"; omit if unknown or not wanted. */
  years?: string
  relation: string
  message: string
  /** Optional photo under public/, e.g. '/memorials/rex.webp'. */
  photo?: string
  /** Marks demo entries; the modal renders them with a gentle note. */
  placeholder?: boolean
}

/**
 * The memorial garden's stones (and the /classic Memorials section).
 * PLACEHOLDER entries ship so the system is demonstrable — Aiden
 * replaces them with real ones.
 *
 * CONSENT RULE: names and photos of living people require their
 * explicit okay before shipping publicly; pets are Aiden's call.
 */
export const memorials: Memorial[] = [
  {
    id: 'memorial-1',
    name: 'A good boy',
    years: '20XX – 20XX',
    relation: 'Placeholder — a beloved pet',
    message:
      'This stone is a placeholder. A real remembrance goes here — a few quiet lines about someone who mattered.',
    placeholder: true,
  },
  {
    id: 'memorial-2',
    name: 'Someone dear',
    relation: 'Placeholder — family',
    message:
      'This stone is a placeholder. Replace it in src/content/memorials.ts with a real name, an optional photo, and a message.',
    placeholder: true,
  },
  {
    id: 'memorial-3',
    name: 'A quiet friend',
    relation: 'Placeholder',
    message: 'This stone is a placeholder — the garden holds space until the real entries arrive.',
    placeholder: true,
  },
]
