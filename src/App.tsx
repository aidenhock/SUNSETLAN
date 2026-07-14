import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { EcctrlJoystick, useJoystickControls } from 'ecctrl'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { interactables } from './content/interactables'
import { Interactable } from './scene/Interactable'
import { Island } from './scene/Island'
import { Lighting } from './scene/Lighting'
import { Player } from './scene/Player'
import { useStore } from './store/useStore'
import { Hud } from './ui/Hud'
import { LoadingScreen } from './ui/LoadingScreen'
import { ModalRoot } from './ui/ModalRoot'

/** Signals that the Suspense subtree (rapier wasm included) has mounted. */
function SceneReady({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady])
  return null
}

export default function App() {
  const modalOpen = useStore((s) => s.openModalId !== null)
  const [sceneReady, setSceneReady] = useState(false)
  const isTouch = useMemo(() => window.matchMedia('(pointer: coarse)').matches, [])

  // If a modal opens mid-touch, the joystick never gets its touchend — clear
  // any in-flight input so the avatar doesn't auto-walk when the modal closes.
  useEffect(() => {
    if (modalOpen && isTouch) {
      const joystick = useJoystickControls.getState()
      joystick.resetJoystick()
      joystick.releaseAllButtons()
    }
  }, [modalOpen, isTouch])

  return (
    <div className="h-full w-full">
      <LoadingScreen ready={sceneReady} />
      <Canvas dpr={[1, 2]} camera={{ fov: 50, position: [0, 6, 12] }}>
        <color attach="background" args={['#ffe3bd']} />
        <Suspense fallback={null}>
          <Lighting />
          {/* Paused physics freezes the avatar in place while a modal is open;
              disableControl on Ecctrl additionally blocks input impulses. */}
          <Physics paused={modalOpen} timeStep="vary">
            <Player />
            <Island />
            {interactables.map((def) => (
              <Interactable key={def.id} def={def} />
            ))}
          </Physics>
          <SceneReady onReady={() => setSceneReady(true)} />
        </Suspense>
      </Canvas>
      {/* Hidden (not unmounted) while a modal is open so in-flight touches still
          deliver touchend to the joystick and WebGL contexts aren't churned. */}
      {isTouch && (
        <div style={{ display: modalOpen ? 'none' : undefined }}>
          <EcctrlJoystick buttonNumber={1} />
        </div>
      )}
      <Hud isTouch={isTouch} />
      <ModalRoot />
    </div>
  )
}
