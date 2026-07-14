import { cards } from '../content/about'
import { contact } from '../content/contact'
import { music } from '../content/music'
import { photos } from '../content/photos'
import { projects } from '../content/projects'
import { videos } from '../content/videos'

/**
 * /classic — the same content files rendered as a normal one-page portfolio.
 * This chunk must never import three.js (SEO + no-WebGL fallback).
 */
export default function ClassicPage() {
  const about = cards.about
  return (
    <div className="min-h-full bg-sand/30 text-ink">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header>
          <h1 className="font-display text-4xl font-bold">Aiden</h1>
          <p className="mt-1 text-lg text-ink/70">Data analyst / developer</p>
          <p className="mt-3">
            <a
              href="/"
              className="font-semibold text-deepwater underline focus-visible:outline-2 focus-visible:outline-deepwater"
            >
              Visit the island (3D)
            </a>
          </p>
        </header>

        <section className="mt-12" aria-labelledby="about-h">
          <h2 id="about-h" className="font-display text-2xl font-bold">
            {about.title}
          </h2>
          <div className="mt-3 space-y-3">
            {about.body.map((p, i) => (
              <p key={i} className="leading-relaxed">
                {p}
              </p>
            ))}
          </div>
        </section>

        <section className="mt-12" aria-labelledby="projects-h">
          <h2 id="projects-h" className="font-display text-2xl font-bold">
            Projects
          </h2>
          <ul className="mt-4 space-y-4">
            {projects.map((project) => (
              <li key={project.title} className="rounded-xl border border-ink/10 bg-white p-4">
                <h3 className="font-display text-lg font-semibold">{project.title}</h3>
                <p className="mt-1 leading-relaxed">{project.blurb}</p>
                <p className="mt-2 text-sm text-ink/60">{project.tech.join(' · ')}</p>
                {(project.link || project.repo) && (
                  <p className="mt-2 flex gap-3 text-sm font-semibold">
                    {project.link && (
                      <a href={project.link} target="_blank" rel="noreferrer" className="text-deepwater underline">
                        Visit
                      </a>
                    )}
                    {project.repo && (
                      <a href={project.repo} target="_blank" rel="noreferrer" className="text-deepwater underline">
                        View code
                      </a>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12" aria-labelledby="photos-h">
          <h2 id="photos-h" className="font-display text-2xl font-bold">
            Photos
          </h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo, i) => (
              <li key={i}>
                <img
                  src={photo.src}
                  alt={photo.alt}
                  loading="lazy"
                  className="aspect-[4/3] w-full rounded-lg object-cover"
                />
                {photo.caption && <p className="mt-1 text-xs text-ink/60">{photo.caption}</p>}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12" aria-labelledby="music-h">
          <h2 id="music-h" className="font-display text-2xl font-bold">
            Music
          </h2>
          <ul className="mt-4 space-y-3">
            {music.map((track) => (
              <li key={track.title}>
                <h3 className="font-semibold">{track.title}</h3>
                {track.embedUrl ? (
                  <iframe src={track.embedUrl} title={track.title} className="mt-1 h-28 w-full rounded-lg border-0" loading="lazy" />
                ) : track.audioSrc ? (
                  <audio controls src={track.audioSrc} className="mt-1 w-full" preload="none" />
                ) : (
                  <p className="text-sm text-ink/60">Recording coming soon.</p>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12" aria-labelledby="videos-h">
          <h2 id="videos-h" className="font-display text-2xl font-bold">
            Videos
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {videos.map((video) => (
              <li key={video.youtubeId}>
                <a
                  href={`https://www.youtube.com/watch?v=${video.youtubeId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-deepwater"
                >
                  <img
                    src={`https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg`}
                    alt=""
                    loading="lazy"
                    className="aspect-video w-full object-cover"
                  />
                  <span className="mt-1 block text-sm font-semibold text-deepwater underline">
                    {video.title}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12" aria-labelledby="contact-h">
          <h2 id="contact-h" className="font-display text-2xl font-bold">
            Contact
          </h2>
          <p className="mt-3">
            <a
              href={`mailto:${contact.email}`}
              className="inline-block rounded-lg bg-lagoon px-4 py-2 font-display font-semibold text-ink"
            >
              Email me
            </a>
          </p>
          <ul className="mt-3 space-y-1">
            {contact.links.map((link) => (
              <li key={link.url}>
                <a href={link.url} target="_blank" rel="noreferrer" className="font-semibold text-deepwater underline">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-16 border-t border-ink/10 pt-6 text-sm text-ink/50">
          <p>Classic view — the same portfolio, no WebGL required.</p>
        </footer>
      </div>
    </div>
  )
}
