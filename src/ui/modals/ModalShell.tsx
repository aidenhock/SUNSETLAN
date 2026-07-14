import { useEffect, useRef } from 'react'
import { useStore } from '../../store/useStore'

/**
 * Shared modal chrome: backdrop, panel, title, Close button, Esc-to-close,
 * and a focus trap (focus moves in on open, Tab cycles, focus restores on
 * close). Content-specific modals render inside.
 */
export function ModalShell({
  title,
  wide = false,
  children,
}: {
  title: string
  wide?: boolean
  children: React.ReactNode
}) {
  const closeModal = useStore((s) => s.closeModal)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

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
        'button, [href], input, select, textarea, audio[controls], iframe, [tabindex]:not([tabindex="-1"])',
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

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/60 p-4"
      onClick={closeModal}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[85vh] w-full flex-col rounded-2xl bg-white p-6 text-ink shadow-2xl ${
          wide ? 'max-w-3xl' : 'max-w-md'
        }`}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 id="modal-title" className="font-display text-2xl font-bold">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeModal}
            className="touch-manipulation rounded-lg bg-lagoon px-3 py-1.5 font-display font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deepwater"
          >
            Close
          </button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
