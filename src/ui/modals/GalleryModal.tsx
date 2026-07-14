import { useEffect, useState } from 'react'
import { photos } from '../../content/photos'
import { ModalShell } from './ModalShell'

/** Responsive grid + lightbox with arrow-key nav and lazy images. */
export function GalleryModal() {
  const [lightbox, setLightbox] = useState<number | null>(null)

  // Lightbox keys run in the capture phase so Esc closes the lightbox first
  // (stopPropagation keeps it from reaching ModalShell's close handler).
  useEffect(() => {
    if (lightbox === null) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setLightbox(null)
      } else if (e.key === 'ArrowRight') {
        setLightbox((i) => (i === null ? i : (i + 1) % photos.length))
      } else if (e.key === 'ArrowLeft') {
        setLightbox((i) => (i === null ? i : (i + photos.length - 1) % photos.length))
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [lightbox])

  const current = lightbox !== null ? photos[lightbox] : null

  return (
    <ModalShell title="Photos" wide>
      {current ? (
        <figure>
          <img src={current.src} alt={current.alt} className="max-h-[55vh] w-full rounded-lg object-contain" />
          <figcaption className="mt-2 text-sm text-ink/70">
            {current.caption ?? current.alt}
            {current.location ? ` — ${current.location}` : ''}
          </figcaption>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setLightbox((i) => (i === null ? i : (i + photos.length - 1) % photos.length))}
              className="touch-manipulation rounded-lg bg-ink/10 px-3 py-1.5 font-display font-semibold focus-visible:outline-2 focus-visible:outline-deepwater"
            >
              Previous photo
            </button>
            <button
              type="button"
              onClick={() => setLightbox((i) => (i === null ? i : (i + 1) % photos.length))}
              className="touch-manipulation rounded-lg bg-ink/10 px-3 py-1.5 font-display font-semibold focus-visible:outline-2 focus-visible:outline-deepwater"
            >
              Next photo
            </button>
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="ml-auto touch-manipulation rounded-lg bg-ink/10 px-3 py-1.5 font-display font-semibold focus-visible:outline-2 focus-visible:outline-deepwater"
            >
              Back to grid
            </button>
          </div>
        </figure>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => setLightbox(i)}
                className="block w-full overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deepwater"
              >
                <img
                  src={photo.src}
                  alt={photo.alt}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover transition-transform hover:scale-105"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </ModalShell>
  )
}
