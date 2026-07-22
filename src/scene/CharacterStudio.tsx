import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useState } from 'react'
import { AIDEN, ROSE, type CharacterConfig } from '../content/characters'
import { BlockyCharacter, type MotionState } from './BlockyCharacter'

/**
 * ?studio — dev-only Character Studio (code-split; prod bundles
 * untouched): the rig centered on a plain gradient, drag-orbit + zoom,
 * pose buttons, and a hand-rolled panel binding LIVE to every
 * CharacterConfig field. "Copy config" exports JSON for characters.ts.
 */

const studioRuntime = { azimuth: Math.PI }

/** Feeds the live camera azimuth to the look-at (the orbit IS the demo). */
function AzimuthProbe() {
  useFrame(({ camera }) => {
    studioRuntime.azimuth = Math.atan2(camera.position.x, camera.position.z)
  })
  return null
}

type Pose = 'idle' | 'walk' | 'run' | 'air'

const NUM_DIALS: Array<[string, keyof CharacterConfig, number, number, number, number]> = [
  // label, key, min, max, step, default
  ['Height (m)', 'height', 0.9, 1.6, 0.01, 1.25],
  ['Heads tall', 'headsTall', 1.8, 2.6, 0.05, 2],
  ['Build', 'build', 0.7, 1.3, 0.01, 1],
  ['Head scale', 'headScale', 0.7, 1.3, 0.01, 1],
  ['Eye scale', 'eyeScale', 0.5, 1.6, 0.01, 1],
  ['Glasses scale', 'glassesScale', 0.5, 1.6, 0.01, 1],
  ['Ear size', 'earSize', 0, 2, 0.05, 1],
  ['Nose size', 'noseSize', 0, 2, 0.05, 1],
  ['Sleeve length', 'sleeveLen', 0, 2, 0.05, 1],
  ['Arm rest (deg)', 'armRestDeg', 0, 45, 1, 28],
  ['Limb thickness', 'limbThick', 0.6, 1.6, 0.01, 1],
  ['Shoulder frac', 'shoulderFrac', 0.2, 0.4, 0.005, 0.275],
  ['Hip frac', 'hipFrac', 0.3, 0.5, 0.005, 0.39],
  ['Neck length (m)', 'neckLength', 0, 0.12, 0.005, 0.06],
]

const COLOR_KEYS = ['skin', 'hair', 'top', 'bottom', 'shoes', 'eyes'] as const

export function CharacterStudio() {
  const [cfg, setCfg] = useState<CharacterConfig>({ ...AIDEN, colors: { ...AIDEN.colors } })
  const [pose, setPose] = useState<Pose>('idle')
  const [lookAt, setLookAt] = useState(true)
  const [copied, setCopied] = useState(false)

  const patch = (p: Partial<CharacterConfig>) => setCfg((c) => ({ ...c, ...p }))
  const motion = (): MotionState => ({
    locomotion: pose === 'air' ? 'idle' : pose,
    airborne: pose === 'air',
    azimuth: lookAt ? studioRuntime.azimuth : Math.PI,
    avatarYaw: 0,
    camPitch: 0.15,
  })
  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(cfg, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div
      className="h-full w-full"
      style={{ background: 'linear-gradient(#d7e5f7 0%, #f4e8d5 100%)' }}
    >
      <Canvas camera={{ fov: 40, near: 0.1, far: 50, position: [0, 1.1, 3] }}>
        <hemisphereLight args={['#bcd7f5', '#e8d8b0', 0.9]} />
        <directionalLight position={[3, 5, 4]} color="#ffd9a0" intensity={1.4} />
        <ambientLight intensity={0.25} />
        <AzimuthProbe />
        <OrbitControls
          target={[0, 0.65, 0]}
          enablePan={false}
          minDistance={1.2}
          maxDistance={8}
        />
        {/* Remount on any config change — geometry rebuild is the point. */}
        <group key={JSON.stringify(cfg)}>
          <BlockyCharacter config={cfg} motion={motion} />
        </group>
      </Canvas>

      {/* Pose bar */}
      <div className="absolute left-4 top-4 flex gap-2">
        {(['idle', 'walk', 'run', 'air'] as Pose[]).map((p) => (
          <button
            key={p}
            onClick={() => setPose(p)}
            className={`rounded px-3 py-1 text-sm font-semibold shadow ${
              pose === p ? 'bg-teal-600 text-white' : 'bg-white/80 text-slate-700'
            }`}
          >
            {p === 'air' ? 'jump' : p}
          </button>
        ))}
        <button
          onClick={() => setLookAt((v) => !v)}
          className={`rounded px-3 py-1 text-sm font-semibold shadow ${
            lookAt ? 'bg-amber-500 text-white' : 'bg-white/80 text-slate-700'
          }`}
        >
          look-at {lookAt ? 'on' : 'off'}
        </button>
        <button
          onClick={() => setCfg({ ...AIDEN, colors: { ...AIDEN.colors } })}
          className="rounded bg-white/80 px-3 py-1 text-sm font-semibold text-slate-700 shadow"
        >
          Aiden
        </button>
        <button
          onClick={() => setCfg({ ...ROSE, colors: { ...ROSE.colors } })}
          className="rounded bg-white/80 px-3 py-1 text-sm font-semibold text-slate-700 shadow"
        >
          Rose
        </button>
      </div>

      {/* Config panel */}
      <div className="absolute right-2 top-2 bottom-2 w-72 overflow-y-auto rounded-lg bg-white/85 p-3 text-xs text-slate-800 shadow-lg backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-bold">Character Studio</span>
          <button
            onClick={copy}
            className="rounded bg-teal-600 px-2 py-1 font-semibold text-white"
          >
            {copied ? 'Copied!' : 'Copy config'}
          </button>
        </div>
        {NUM_DIALS.map(([label, key, min, max, step, dflt]) => (
          <label key={key} className="mb-1 block">
            <span className="flex justify-between">
              <span>{label}</span>
              <span className="tabular-nums">
                {((cfg[key] as number | undefined) ?? dflt).toFixed(step < 0.01 ? 3 : 2)}
              </span>
            </span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={(cfg[key] as number | undefined) ?? dflt}
              onChange={(e) => patch({ [key]: Number(e.target.value) })}
              className="w-full"
            />
          </label>
        ))}
        <div className="mt-2 grid grid-cols-2 gap-1">
          {COLOR_KEYS.map((k) => (
            <label key={k} className="flex items-center gap-1">
              <input
                type="color"
                value={cfg.colors[k]}
                onChange={(e) =>
                  setCfg((c) => ({ ...c, colors: { ...c.colors, [k]: e.target.value } }))
                }
              />
              <span>{k}</span>
            </label>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="flex items-center gap-1">
            hair
            <select
              value={cfg.hair}
              onChange={(e) => patch({ hair: e.target.value as CharacterConfig['hair'] })}
              className="rounded border px-1"
            >
              <option value="swoop">swoop</option>
              <option value="bob">bob</option>
              <option value="none">none</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            outfit
            <select
              value={cfg.outfit}
              onChange={(e) => patch({ outfit: e.target.value as CharacterConfig['outfit'] })}
              className="rounded border px-1"
            >
              <option value="tee-shorts">tee-shorts</option>
              <option value="dress">dress</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={!!cfg.blush}
              onChange={(e) => patch({ blush: e.target.checked })}
            />
            blush
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={!!cfg.glasses}
              onChange={(e) =>
                patch({ glasses: e.target.checked ? { color: '#14262b' } : undefined })
              }
            />
            glasses
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={(cfg.noseStyle ?? 'round') !== 'none'}
              onChange={(e) => patch({ noseStyle: e.target.checked ? 'round' : 'none' })}
            />
            nose
          </label>
        </div>
      </div>
    </div>
  )
}
