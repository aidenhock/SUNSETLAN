import { useState } from 'react'
import { videos } from '../../content/videos'
import { ModalShell } from './ModalShell'

/** Lite-embed: thumbnail first; the iframe is injected only on click. */
export function VideosModal() {
  const [playing, setPlaying] = useState<string | null>(null)

  return (
    <ModalShell title="Videos" wide>
      <ul className="grid gap-4 sm:grid-cols-2">
        {videos.map((video) => (
          <li key={video.youtubeId}>
            <h3 className="mb-2 font-display font-semibold">{video.title}</h3>
            {playing === video.youtubeId ? (
              <iframe
                // The Play button unmounts on swap; focus the player so
                // keyboard focus stays inside the modal.
                ref={(el) => el?.focus()}
                src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1`}
                title={video.title}
                className="aspect-video w-full rounded-lg border-0"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <button
                type="button"
                onClick={() => setPlaying(video.youtubeId)}
                className="group relative block w-full overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deepwater"
              >
                <img
                  src={`https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg`}
                  alt={`Play ${video.title}`}
                  loading="lazy"
                  className="aspect-video w-full object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="rounded-full bg-ink/80 px-5 py-3 font-display font-bold text-sand transition-transform group-hover:scale-110">
                    ▶ Play
                  </span>
                </span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </ModalShell>
  )
}
