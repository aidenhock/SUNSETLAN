export interface Track {
  title: string
  /** Streaming embed (Spotify/SoundCloud/Bandcamp iframe URL). */
  embedUrl?: string
  /** Or a locally hosted audio file. */
  audioSrc?: string
}

export const music: Track[] = [
  { title: 'Ukulele demo (placeholder)' },
  { title: 'Campfire loop (placeholder)' },
]
