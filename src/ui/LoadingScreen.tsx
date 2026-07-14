import { useProgress } from '@react-three/drei'
import { useState } from 'react'

export function LoadingScreen({ ready }: { ready: boolean }) {
  const { progress, active } = useProgress()
  const [gone, setGone] = useState(false)

  const done = ready && !active
  if (gone) return null

  const percent = done ? 100 : Math.round(progress)

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-ink text-sand transition-opacity duration-700 ${
        done ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      onTransitionEnd={() => done && setGone(true)}
      aria-hidden={done}
    >
      <h1 className="font-display text-4xl font-bold tracking-widest">AIDEN</h1>
      <p className="text-sm uppercase tracking-[0.3em] text-sand/70">island portfolio</p>
      <p className="mt-4 font-display text-lg tabular-nums" role="status">
        {percent}%
      </p>
    </div>
  )
}
