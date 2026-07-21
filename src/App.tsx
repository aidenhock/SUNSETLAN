import { KeyboardControls, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { TouchJoystick } from './controls/TouchJoystick'
import { PlanetScene } from './scene/Planet'
import { useStore } from './store/useStore'
import { Hud } from './ui/Hud'
import { LoadingScreen } from './ui/LoadingScreen'
import { ModalRoot } from './ui/ModalRoot'

const keyboardMap = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'leftward', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'rightward', keys: ['ArrowRight', 'KeyD'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'run', keys: ['ShiftLeft', 'ShiftRight'] },
]

/** Signals that the Suspense subtree has mounted. */
function SceneReady({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady])
  return null
}

/** Dev-only profiler overlay, code-split behind the ?perf flag. */
const Perf = lazy(() => import('r3f-perf').then((m) => ({ default: m.Perf })))

/** Machine-readable render stats for the e2e/measure tooling (?e2e / ?perf). */
function RenderInfoProbe() {
  const { gl } = useThree()
  useEffect(() => {
    ;(window as unknown as { __renderInfo?: unknown }).__renderInfo = () => ({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      pixelRatio: gl.getPixelRatio(),
    })
  }, [gl])
  return null
}

/** Dev/e2e-only isolated character viewer (?chartest), code-split. */
const CharacterShowcase = lazy(() =>
  import('./scene/CharacterShowcase').then((m) => ({ default: m.CharacterShowcase })),
)

export default function App() {
  const [sceneReady, setSceneReady] = useState(false)
  // The perf monitor arms a few seconds after the scene mounts — startup
  // hitches (shader compile, terrain baking) must not trip the low tier.
  const [monitorArmed, setMonitorArmed] = useState(false)
  useEffect(() => {
    if (!sceneReady) return
    const t = setTimeout(() => setMonitorArmed(true), 4000)
    return () => clearTimeout(t)
  }, [sceneReady])
  const isTouch = useMemo(() => window.matchMedia('(pointer: coarse)').matches, [])
  const modalOpen = useStore((s) => s.openModalId !== null)
  const flags = useMemo(() => new URLSearchParams(window.location.search), [])
  const showPerf = flags.has('perf')
  const probeInfo = showPerf || flags.has('e2e')
  // The swoop is skipped for e2e/measure runs (they need instant control) and
  // for prefers-reduced-motion (the loading screen's fade is the entrance).
  const intro = useMemo(
    () => !flags.has('e2e') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [flags],
  )
  const qualityTier = useStore((s) => s.qualityTier)

  if (flags.has('chartest')) {
    return (
      <Suspense fallback={null}>
        <CharacterShowcase />
      </Suspense>
    )
  }

  return (
    <div className="h-full w-full">
      {/* Everything behind an open modal is inert: unfocusable, invisible to
          AT, and immune to Tab escaping cross-origin iframes in the modal. */}
      <div className="h-full w-full" inert={modalOpen}>
        <LoadingScreen ready={sceneReady} />
        <Canvas
          // The low tier halves the pixel load — the main lever for weak GPUs.
          dpr={qualityTier === 'low' ? 1 : [1, 2]}
          camera={{ fov: 50, near: 0.1, far: 400, position: [0, 60, 8] }}
        >
          {/* Mount at the day fog blue; useSkyState re-lerps per frame. */}
          <color attach="background" args={['#a8c6e8']} />
          {/* Fog softens the horizon so the curvature reads at golden hour. */}
          <fog attach="fog" args={['#a8c6e8', 60, 220]} />
          {/* Sustained fps drops flip qualityTier low (DPR 1; 3B/3C also gate
              stars/notes/critters on it). Two flip-flops lock low for good. */}
          {monitorArmed && (
            <PerformanceMonitor
              // Explicit contract: struggling below 40 fps → shed pixels;
              // comfortably above 58 → restore.
              bounds={() => [40, 58]}
              onChange={
                probeInfo
                  ? ({ fps, factor }) => {
                      ;(window as unknown as { __pmDebug?: unknown }).__pmDebug = { fps, factor }
                    }
                  : undefined
              }
              onDecline={() => useStore.getState().setQualityTier('low')}
              onIncline={() => useStore.getState().setQualityTier('high')}
              flipflops={2}
              onFallback={() => useStore.getState().setQualityTier('low')}
            />
          )}
          <Suspense fallback={null}>
            {/* Lights live in SkyRig (inside PlanetScene): useSkyState drives
                them, the fog color, and this background per frame. */}
            <KeyboardControls map={keyboardMap}>
              <PlanetScene isTouch={isTouch} intro={intro} />
            </KeyboardControls>
            <SceneReady onReady={() => setSceneReady(true)} />
            {showPerf && <Perf position="top-left" />}
            {probeInfo && <RenderInfoProbe />}
          </Suspense>
        </Canvas>
        {isTouch && <TouchJoystick />}
        <Hud isTouch={isTouch} />
      </div>
      <ModalRoot />
    </div>
  )
}
