import { useEffect, useRef, useState } from 'react'
import { interactables } from '../content/interactables'
import { useStore } from '../store/useStore'
import { PromptE } from './PromptE'

export function Hud({ isTouch }: { isTouch: boolean }) {
  const nearbyId = useStore((s) => s.nearbyId)
  const openModalId = useStore((s) => s.openModalId)
  const hasMoved = useStore((s) => s.hasMoved)
  const pointerLocked = useStore((s) => s.pointerLocked)
  const cameraMode = useStore((s) => s.settings.cameraMode)
  const setCameraMode = useStore((s) => s.setCameraMode)
  const [menuOpen, setMenuOpen] = useState(false)

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
  // Also shown right after a modal closes ("click to resume", per the brief);
  // stacks above the interact prompt when both occupy bottom-center.
  const showLookHint = !isTouch && cameraMode === 'pointerLock' && !pointerLocked && !openModalId

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
        <p
          className={`fixed ${nearby ? 'bottom-24' : 'bottom-6'} left-1/2 -translate-x-1/2 rounded-lg bg-ink/85 px-3 py-1.5 text-center font-display text-xs text-sand shadow`}
        >
          {everLocked.current
            ? 'Click to resume looking around'
            : 'Click to look around · Esc frees your cursor'}
        </p>
      )}
      {nearby && !openModalId && <PromptE def={nearby} isTouch={isTouch} />}

      <div className="pointer-events-auto fixed top-6 right-6 flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          className="touch-manipulation rounded-lg bg-ink/85 px-3 py-1.5 font-display text-sm font-semibold text-sand shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lagoon"
        >
          Menu
        </button>
        {menuOpen && (
          <div className="flex flex-col items-stretch gap-1 rounded-lg bg-ink/85 p-2 font-display text-sm text-sand shadow-lg">
            {!isTouch && (
              <button
                type="button"
                onClick={() => setCameraMode(cameraMode === 'pointerLock' ? 'orbit' : 'pointerLock')}
                className="touch-manipulation rounded px-2 py-1 text-left hover:bg-sand/10 focus-visible:outline-2 focus-visible:outline-lagoon"
              >
                Camera: {cameraMode === 'pointerLock' ? 'mouse look' : 'drag to orbit'}
              </button>
            )}
            <a
              href="/classic"
              className="rounded px-2 py-1 hover:bg-sand/10 focus-visible:outline-2 focus-visible:outline-lagoon"
            >
              View classic site
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
