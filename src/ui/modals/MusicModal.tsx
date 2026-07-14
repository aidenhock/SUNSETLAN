import { music } from '../../content/music'
import { ModalShell } from './ModalShell'

export function MusicModal() {
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
              <p className="text-sm text-ink/60">Recording coming soon.</p>
            )}
          </li>
        ))}
      </ul>
    </ModalShell>
  )
}
