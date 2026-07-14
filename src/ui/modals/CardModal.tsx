import { useEffect, useRef } from 'react'
import { cards } from '../../content/about'
import type { InteractableDef } from '../../content/interactables'
import { useStore } from '../../store/useStore'

export function CardModal({ def }: { def: InteractableDef }) {
  const closeModal = useStore((s) => s.closeModal)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const content = cards[def.contentKey]

  // Focus management: move focus in on open, trap Tab, restore on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [closeModal])

  if (!content) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/60 p-4"
      onClick={closeModal}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 text-ink shadow-2xl"
      >
        <h2 id="card-modal-title" className="font-display text-2xl font-bold">
          {content.title}
        </h2>
        <div className="mt-3 space-y-3">
          {content.body.map((paragraph, i) => (
            <p key={i} className="leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={closeModal}
          className="mt-6 rounded-lg bg-lagoon px-4 py-2 font-display font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deepwater"
        >
          Close
        </button>
      </div>
    </div>
  )
}
