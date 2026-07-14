import { KeyboardControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { TouchJoystick } from './controls/TouchJoystick'
import { PlanetScene } from './scene/Planet'
import { Lighting } from './scene/Lighting'
import { Hud } from './ui/Hud'
import { LoadingScreen } from './ui/LoadingScreen'
import { ModalRoot } from './ui/ModalRoot'

const keyboardMap = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'leftward', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'rightward', keys: ['ArrowRight', 'KeyD'] },
  { name: 'jump', keys: ['Space'] },
]

/** Signals that the Suspense subtree has mounted. */
function SceneReady({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady])
  return null
}

export default function App() {
  const [sceneReady, setSceneReady] = useState(false)
  const isTouch = useMemo(() => window.matchMedia('(pointer: coarse)').matches, [])

  return (
    <div className="h-full w-full">
      <LoadingScreen ready={sceneReady} />
      <Canvas dpr={[1, 2]} camera={{ fov: 50, near: 0.1, far: 400, position: [0, 75, 8] }}>
        <color attach="background" args={['#ffe3bd']} />
        {/* Fog softens the horizon so the curvature reads at golden hour. */}
        <fog attach="fog" args={['#ffe3bd', 60, 220]} />
        <Suspense fallback={null}>
          <Lighting />
          <KeyboardControls map={keyboardMap}>
            <PlanetScene isTouch={isTouch} />
          </KeyboardControls>
          <SceneReady onReady={() => setSceneReady(true)} />
        </Suspense>
      </Canvas>
      {isTouch && <TouchJoystick />}
      <Hud isTouch={isTouch} />
      <ModalRoot />
    </div>
  )
}
