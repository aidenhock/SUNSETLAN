import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { interactables } from './content/interactables'
import { Interactable } from './scene/Interactable'
import { Island } from './scene/Island'
import { Lighting } from './scene/Lighting'
import { Hud } from './ui/Hud'
import { LoadingScreen } from './ui/LoadingScreen'
import { ModalRoot } from './ui/ModalRoot'

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
      <Canvas dpr={[1, 2]} camera={{ fov: 50, position: [0, 4, 10] }}>
        <color attach="background" args={['#ffe3bd']} />
        <Suspense fallback={null}>
          <Lighting />
          {/* Transitional state: physics and the character controller were
              removed with ecctrl/rapier; the planet controller replaces them. */}
          <Island />
          {interactables.map((def) => (
            <Interactable key={def.id} def={def} />
          ))}
          <mesh position={[0, 0.95, 6]}>
            <capsuleGeometry args={[0.3, 0.7]} />
            <meshStandardMaterial color="#55a05f" flatShading />
          </mesh>
          <SceneReady onReady={() => setSceneReady(true)} />
        </Suspense>
      </Canvas>
      <Hud isTouch={isTouch} />
      <ModalRoot />
    </div>
  )
}
