import { useEffect, useMemo, useRef, useState } from 'react'
import { photos } from '../../content/photos'
import {
  neighborIndices,
  pageCount,
  pageLabel,
  pageOf,
  pageRange,
  wrapIndex,
} from '../galleryMath'
import { EmptyState } from './EmptyState'
import { ModalShell } from './ModalShell'

/**
 * Photos (Phase 4 gallery): a paginated grid (6 per page — 3×2 on
 * desktop, 2×3 on mobile; uniform cover-cropped tiles that reserve
 * their box, so lazy thumbs never shift layout) and a full-screen
 * viewer that shows the web-sized image FIT (letterboxed, never
 * cropped) with continuous wrap-around navigation across ALL photos.
 * The grid's page follows the viewer. Thumbs fade in on load; the
 * viewer shows the (usually cached) thumb blurred underneath while the
 * full image arrives, and preloads the ±1 neighbors. All keys are
 * handled inside the modal system — the world's controls stay
 * suppressed while any modal is open.
 */
export function GalleryModal() {
  const [page, setPage] = useState(0)
  const [viewer, setViewer] = useState<number | null>(null)

  if (photos.length === 0) {
    return (
      <ModalShell title="Photos" wide>
        <EmptyState
          icon="📷"
          headline="The tripod is set up, the film is loading"
          sub="Photos from beyond the island are on their way — check back soon."
        />
      </ModalShell>
    )
  }
  return (
    <ModalShell title="Photos" wide>
      <Grid page={page} setPage={setPage} openViewer={setViewer} viewerOpen={viewer !== null} />
      {viewer !== null && (
        <Viewer
          index={viewer}
          setIndex={(i) => setViewer(i)}
          onExit={(atIndex) => {
            setPage(pageOf(atIndex))
            setViewer(null)
          }}
        />
      )}
    </ModalShell>
  )
}

/** Horizontal swipe detection shared by the grid and the viewer.
 * `swiped` flags the release of a swipe so click handlers can ignore
 * the browser-synthesized click that follows every drag — without it a
 * grid swipe would open a tile and a viewer swipe would exit. (Images
 * also need draggable={false}: native image drag swallows pointerup.) */
function useSwipe(onSwipe: (dir: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY }
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (!start.current) return
      const dx = e.clientX - start.current.x
      const dy = e.clientY - start.current.y
      start.current = null
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        swiped.current = true
        onSwipe(dx < 0 ? 1 : -1)
      } else {
        swiped.current = false
      }
    },
  }
  /** True exactly once for the click synthesized after a swipe. */
  const consumeSwipeClick = () => {
    const was = swiped.current
    swiped.current = false
    return was
  }
  return { handlers, consumeSwipeClick }
}

function Grid({
  page,
  setPage,
  openViewer,
  viewerOpen,
}: {
  page: number
  setPage: (p: number) => void
  openViewer: (index: number) => void
  viewerOpen: boolean
}) {
  const total = photos.length
  const pages = pageCount(total)
  const { start, end } = pageRange(page, total)
  const [loaded, setLoaded] = useState<Record<string, boolean>>({})
  const gridRef = useRef<HTMLUListElement>(null)

  const goto = (p: number) => setPage(Math.max(0, Math.min(pages - 1, p)))
  const { handlers: swipeHandlers, consumeSwipeClick } = useSwipe((dir) => goto(page + dir))

  // Grid-mode keys: page with ← → (the viewer overrides these in the
  // capture phase while it is open).
  useEffect(() => {
    if (viewerOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goto(page + 1)
      else if (e.key === 'ArrowLeft') goto(page - 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <div {...swipeHandlers}>
      <ul ref={gridRef} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.slice(start, end).map((p, k) => (
          <li key={p.id}>
            <button
              type="button"
              data-photo-idx={start + k}
              onClick={() => {
                if (!consumeSwipeClick()) openViewer(start + k)
              }}
              aria-label={`Open photo: ${p.title}`}
              className="block w-full overflow-hidden rounded-xl border border-ink/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deepwater"
            >
              {/* The aspect box reserves layout before the thumb lands. */}
              <span className="block aspect-[4/3] w-full bg-sand/40">
                <img
                  src={p.thumb}
                  alt={p.alt}
                  loading="lazy"
                  draggable={false}
                  onLoad={() => setLoaded((s) => (s[p.id] ? s : { ...s, [p.id]: true }))}
                  className={`h-full w-full object-cover transition-opacity duration-300 ${
                    loaded[p.id] ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => goto(page - 1)}
          disabled={page === 0}
          aria-label="Previous page"
          className="touch-manipulation rounded-lg bg-lagoon/20 px-3 py-1.5 font-display font-bold text-deepwater disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-deepwater"
        >
          ‹
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink/70">{pageLabel(page, total)}</span>
          <span className="flex gap-1.5" aria-hidden>
            {Array.from({ length: pages }, (_, p) => (
              <button
                key={p}
                type="button"
                tabIndex={-1}
                onClick={() => goto(p)}
                className={`h-2 w-2 rounded-full transition-colors ${
                  p === page ? 'bg-deepwater' : 'bg-ink/20'
                }`}
              />
            ))}
          </span>
        </div>
        <button
          type="button"
          onClick={() => goto(page + 1)}
          disabled={page === pages - 1}
          aria-label="Next page"
          className="touch-manipulation rounded-lg bg-lagoon/20 px-3 py-1.5 font-display font-bold text-deepwater disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-deepwater"
        >
          ›
        </button>
      </div>
    </div>
  )
}

function Viewer({
  index,
  setIndex,
  onExit,
}: {
  index: number
  setIndex: (i: number) => void
  onExit: (atIndex: number) => void
}) {
  const total = photos.length
  const photo = photos[index]
  const [fullLoaded, setFullLoaded] = useState<Record<string, boolean>>({})
  const closeRef = useRef<HTMLButtonElement>(null)
  const openerIdx = useRef(index)
  const { handlers: swipeHandlers, consumeSwipeClick } = useSwipe((dir) =>
    setIndex(wrapIndex(index + dir, total)),
  )

  // Focus moves into the viewer on open and back to the opening tile on
  // exit (the grid re-renders to the right page first).
  useEffect(() => {
    openerIdx.current = index
  }, [index])
  useEffect(() => {
    closeRef.current?.focus()
    return () => {
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLButtonElement>(`[data-photo-idx="${openerIdx.current}"]`)
          ?.focus()
      })
    }
  }, [])

  // Viewer keys run in the CAPTURE phase so Esc exits the viewer (not
  // the whole modal) and arrows never reach the grid's pager.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onExit(index)
      } else if (e.key === 'ArrowRight') {
        e.stopPropagation()
        setIndex(wrapIndex(index + 1, total))
      } else if (e.key === 'ArrowLeft') {
        e.stopPropagation()
        setIndex(wrapIndex(index - 1, total))
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [index, total, setIndex, onExit])

  // Preload the wrapped ±1 neighbors so paging feels instant.
  const neighbors = useMemo(() => neighborIndices(index, total), [index, total])
  useEffect(() => {
    for (const n of neighbors) {
      const img = new Image()
      img.src = photos[n].full
    }
  }, [neighbors])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo: ${photo.title}`}
      className="fixed inset-0 z-50 flex flex-col bg-ink/95"
      onClick={() => {
        if (!consumeSwipeClick()) onExit(index)
      }}
      {...swipeHandlers}
    >
      <div className="flex justify-end p-3">
        <button
          ref={closeRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onExit(index)
          }}
          aria-label="Back to grid"
          className="touch-manipulation rounded-lg bg-sand/20 px-3 py-1.5 font-display font-semibold text-sand focus-visible:outline-2 focus-visible:outline-lagoon"
        >
          ✕
        </button>
      </div>

      <figure
        className="relative flex min-h-0 flex-1 items-center justify-center px-12 pb-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Blurred (usually cached) thumb underneath while the full
            image arrives — a lightweight placeholder, never a spinner. */}
        {!fullLoaded[photo.id] && (
          <img
            src={photo.thumb}
            alt=""
            aria-hidden
            className="absolute inset-0 m-auto max-h-full max-w-full scale-105 object-contain opacity-40 blur-md"
          />
        )}
        <img
          key={photo.id}
          src={photo.full}
          alt={photo.alt}
          width={photo.width}
          height={photo.height}
          draggable={false}
          onLoad={() => setFullLoaded((s) => (s[photo.id] ? s : { ...s, [photo.id]: true }))}
          className={`relative max-h-full max-w-full rounded object-contain transition-opacity duration-200 ${
            fullLoaded[photo.id] ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </figure>
      <figcaption className="px-14 pb-4 text-center" onClick={(e) => e.stopPropagation()}>
        <span className="font-display font-semibold text-sand">{photo.title}</span>
        {photo.caption && <span className="block text-sm text-sand/70">{photo.caption}</span>}
        <span className="mt-1 block text-xs text-sand/50">
          {index + 1} of {total}
        </span>
      </figcaption>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setIndex(wrapIndex(index - 1, total))
        }}
        aria-label="Previous photo"
        className="absolute top-1/2 left-2 -translate-y-1/2 touch-manipulation rounded-full bg-ink/60 px-3 py-2 font-display text-xl font-bold text-sand focus-visible:outline-2 focus-visible:outline-lagoon"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setIndex(wrapIndex(index + 1, total))
        }}
        aria-label="Next photo"
        className="absolute top-1/2 right-2 -translate-y-1/2 touch-manipulation rounded-full bg-ink/60 px-3 py-2 font-display text-xl font-bold text-sand focus-visible:outline-2 focus-visible:outline-lagoon"
      >
        ›
      </button>
    </div>
  )
}
