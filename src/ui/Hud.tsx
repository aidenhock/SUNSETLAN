import { useEffect } from 'react'
import { interactables } from '../content/interactables'
import { useStore } from '../store/useStore'
import { PromptE } from './PromptE'

export function Hud({ isTouch }: { isTouch: boolean }) {
  const nearbyId = useStore((s) => s.nearbyId)
  const openModalId = useStore((s) => s.openModalId)
  const hasMoved = useStore((s) => s.hasMoved)

  // hasMoved is set from player displacement in Player.tsx; this handler only
  // covers the interact key.
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

  return (
    <div className="pointer-events-none fixed inset-0 z-30">
      {!hasMoved && (
        <p className="fixed top-6 left-1/2 -translate-x-1/2 rounded-lg bg-ink/85 px-4 py-2 text-center font-display text-sm text-sand shadow-lg">
          {isTouch
            ? 'Drag the joystick to move — walk up to things and tap the button.'
            : 'WASD / drag to move — walk up to things and press E.'}
        </p>
      )}
      {nearby && !openModalId && <PromptE def={nearby} isTouch={isTouch} />}
    </div>
  )
}
