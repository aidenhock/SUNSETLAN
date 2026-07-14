import { useEffect, useRef } from 'react'
import { interactables } from '../content/interactables'
import { useStore } from '../store/useStore'
import { PromptE } from './PromptE'

export function Hud({ isTouch }: { isTouch: boolean }) {
  const nearbyId = useStore((s) => s.nearbyId)
  const openModalId = useStore((s) => s.openModalId)
  const hasMoved = useStore((s) => s.hasMoved)
  const pointerLocked = useStore((s) => s.pointerLocked)
  const cameraMode = useStore((s) => s.settings.cameraMode)

  // Remember whether the visitor has ever locked, to shorten the hint.
  const everLocked = useRef(false)
  if (pointerLocked) everLocked.current = true

  // hasMoved is set from planet rotation in usePlanetController; this handler
  // only covers the interact key.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      const { nearbyId, openModalId, openModal } = useStore.getState()
      if (e.code === 'KeyE' && nearbyId && !openModalId) openModal(nearbyId)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const nearby = interactables.find((i) => i.id === nearbyId)
  // Suppressed while the interact prompt is up — they share the bottom-center slot.
  const showLookHint =
    !isTouch && cameraMode === 'pointerLock' && !pointerLocked && !openModalId && !nearby

  return (
    <div className="pointer-events-none fixed inset-0 z-30">
      {!hasMoved && (
        <p className="fixed top-6 left-1/2 -translate-x-1/2 rounded-lg bg-ink/85 px-4 py-2 text-center font-display text-sm text-sand shadow-lg">
          {isTouch
            ? 'Drag the joystick to move — walk up to things and tap the button.'
            : 'WASD / drag to move — walk up to things and press E.'}
        </p>
      )}
      {showLookHint && (
        <p className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-ink/70 px-3 py-1.5 text-center font-display text-xs text-sand/90 shadow">
          {everLocked.current
            ? 'Click to resume looking around'
            : 'Click to look around · Esc frees your cursor'}
        </p>
      )}
      {nearby && !openModalId && <PromptE def={nearby} isTouch={isTouch} />}
    </div>
  )
}
