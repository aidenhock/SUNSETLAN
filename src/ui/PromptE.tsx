import type { InteractableDef } from '../content/interactables'
import { useStore } from '../store/useStore'

export function PromptE({ def, isTouch }: { def: InteractableDef; isTouch: boolean }) {
  const openModal = useStore((s) => s.openModal)

  if (isTouch) {
    return (
      <button
        type="button"
        onClick={() => openModal(def.id)}
        // bottom-56 keeps the button clear of ecctrl's 200px-tall bottom-right
        // button canvas, which sits at z-index 9999 and swallows taps under it.
        className="pointer-events-auto fixed right-6 bottom-56 z-40 flex h-20 w-20 touch-manipulation items-center justify-center rounded-full bg-lagoon font-display text-sm font-bold text-ink shadow-lg active:scale-95"
      >
        {def.label}
      </button>
    )
  }

  return (
    <div className="pointer-events-none fixed bottom-10 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-ink/85 px-4 py-2 font-display text-sand shadow-lg">
      <kbd className="mr-2 rounded border border-sand/40 bg-ink px-1.5 py-0.5 text-sm">E</kbd>
      {def.label}
    </div>
  )
}
