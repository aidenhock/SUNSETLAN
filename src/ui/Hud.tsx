import { useEffect, useRef, useState } from 'react'
import { interactables } from '../content/interactables'
import { projectSeatOffset } from '../controls/planetMath'
import { controlsRuntime } from '../controls/usePlanetController'
import { PLANET_RADIUS } from '../scene/planetConfig'
import { LOG_AXES, LOG_UNITS, SEAT_HALF_SPAN_M } from '../scene/seats'
import { useStore } from '../store/useStore'
import { PromptE } from './PromptE'

/** Free-position sit (campfire polish 4): project the camera's aim
 * point onto the nearby log's centerline, clamped to the usable span —
 * you sit exactly where you aimed. */
function requestSit() {
  const { nearbyLog, sitDown } = useStore.getState()
  if (nearbyLog === null) return
  const q = controlsRuntime.planetQuaternion
  const center = LOG_UNITS[nearbyLog].clone().applyQuaternion(q).multiplyScalar(PLANET_RADIUS)
  const axis = LOG_AXES[nearbyLog].clone().applyQuaternion(q)
  const axisLen = Math.hypot(axis.x, axis.z)
  if (axisLen < 1e-6) return
  const offsetM = projectSeatOffset(
    [center.x, center.z],
    [axis.x / axisLen, axis.z / axisLen],
    controlsRuntime.azimuth,
    SEAT_HALF_SPAN_M,
  )
  sitDown({ log: nearbyLog, offsetM })
}

function SitPrompt({ seated, isTouch }: { seated: boolean; isTouch: boolean }) {
  const standUp = useStore((s) => s.standUp)
  if (isTouch) {
    return (
      <button
        type="button"
        onClick={() => (seated ? standUp() : requestSit())}
        className="pointer-events-auto fixed right-6 bottom-8 z-40 flex h-20 w-20 touch-manipulation items-center justify-center rounded-full bg-lagoon font-display text-sm font-bold text-ink shadow-lg active:scale-95"
      >
        {seated ? 'Stand' : 'Sit'}
      </button>
    )
  }
  return (
    <div className="pointer-events-none fixed bottom-10 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-ink/85 px-4 py-2 font-display text-sand shadow-lg">
      <kbd className="mr-2 rounded border border-sand/40 bg-ink px-1.5 py-0.5 text-sm">E</kbd>
      {seated ? 'Stand up' : 'Sit'}
    </div>
  )
}

export function Hud({ isTouch }: { isTouch: boolean }) {
  const nearbyId = useStore((s) => s.nearbyId)
  const nearbyLog = useStore((s) => s.nearbyLog)
  const seatedSeat = useStore((s) => s.seatedSeat)
  const openModalId = useStore((s) => s.openModalId)
  const hasMoved = useStore((s) => s.hasMoved)
  const introDone = useStore((s) => s.introDone)
  const pointerLocked = useStore((s) => s.pointerLocked)
  const cameraMode = useStore((s) => s.settings.cameraMode)
  const setCameraMode = useStore((s) => s.setCameraMode)
  // Also positions the intro hint: on phones the centered bubble is wide
  // enough to run under the minimap in the top-left corner.
  const minimapVisible = useStore((s) => s.minimapVisible)
  const toggleMinimap = useStore((s) => s.toggleMinimap)
  const resetExploration = useStore((s) => s.resetExploration)
  const [menuOpen, setMenuOpen] = useState(false)

  // Remember whether the visitor has ever locked, to shorten the hint.
  const everLocked = useRef(false)
  if (pointerLocked) everLocked.current = true

  // hasMoved is set from planet rotation in usePlanetController; this handler
  // only covers the interact key.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      const { nearbyId, nearbyLog, seatedSeat, openModalId, openModal, standUp } =
        useStore.getState()
      if (e.code === 'KeyM' && !openModalId) {
        useStore.getState().toggleMinimap()
        return
      }
      if (e.code !== 'KeyE' || openModalId) return
      // Priority: stand up if seated; interactables own E otherwise; the
      // sit prompt takes it only when nothing else wants the key.
      if (seatedSeat) standUp()
      else if (nearbyId) openModal(nearbyId)
      else if (nearbyLog !== null) requestSit()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const nearby = interactables.find((i) => i.id === nearbyId)
  // Also shown right after a modal closes ("click to resume", per the brief);
  // stacks above the interact prompt when both occupy bottom-center.
  // Hints stay hidden during the intro swoop — no chrome over the cinematic.
  const showLookHint =
    introDone && !isTouch && cameraMode === 'pointerLock' && !pointerLocked && !openModalId

  return (
    <div className="pointer-events-none fixed inset-0 z-30">
      {introDone && !hasMoved && !openModalId && (
        <p
          className={`fixed ${
            isTouch && minimapVisible ? 'top-36' : 'top-6'
          } left-1/2 -translate-x-1/2 max-w-[min(24rem,70vw)] rounded-lg bg-ink/85 px-4 py-2 text-center font-display text-sm text-sand shadow-lg`}
        >
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
      {/* Sit prompt (3C): only when no interactable wants E. Stand hint
          while seated is quieter — jump also works. */}
      {!nearby && !openModalId && (seatedSeat || nearbyLog !== null) && (
        <SitPrompt seated={Boolean(seatedSeat)} isTouch={isTouch} />
      )}

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
            <button
              type="button"
              onClick={toggleMinimap}
              className="touch-manipulation rounded px-2 py-1 text-left hover:bg-sand/10 focus-visible:outline-2 focus-visible:outline-lagoon"
            >
              Minimap: {minimapVisible ? 'on' : 'off'} (M)
            </button>
            <button
              type="button"
              onClick={resetExploration}
              className="touch-manipulation rounded px-2 py-1 text-left hover:bg-sand/10 focus-visible:outline-2 focus-visible:outline-lagoon"
            >
              Reset exploration
            </button>
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
