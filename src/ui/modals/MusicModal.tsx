import { music } from '../../content/music'
import { EmptyState } from './EmptyState'
import { ModalShell } from './ModalShell'

export function MusicModal() {
  if (music.length === 0) {
    return (
      <ModalShell title="Music">
        <EmptyState
          icon="🎶"
          headline="The ukulele is still warming up"
          sub="Recordings are on their way — for now, Koa on the dock has the stage."
        />
      </ModalShell>
    )
  }
  return (
    <ModalShell title="Music">
      <ul className="space-y-4">
        {music.map((track) => (
          <li key={track.title}>
            <h3 className="font-display font-semibold">{track.title}</h3>
            {track.embedUrl ? (
              <iframe
                src={track.embedUrl}
                title={track.title}
                className="mt-2 h-28 w-full rounded-lg border-0"
                loading="lazy"
                allow="encrypted-media"
              />
            ) : track.audioSrc ? (
              <audio controls src={track.audioSrc} className="mt-2 w-full" preload="none" />
            ) : (
              <p className="text-sm text-ink/70">Recording coming soon.</p>
            )}
          </li>
        ))}
      </ul>
    </ModalShell>
  )
}
