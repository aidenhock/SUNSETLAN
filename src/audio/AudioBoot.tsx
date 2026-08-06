import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { armAudio } from './core'

/**
 * Arms the audio core on the FIRST user gesture (pointer or key) — the
 * only place an AudioContext is ever created. Idempotent; both
 * listeners are once-only and armAudio no-ops after the first call.
 */
export function AudioBoot() {
  const { camera } = useThree()
  useEffect(() => {
    const arm = () => armAudio(camera)
    window.addEventListener('pointerdown', arm, { once: true })
    window.addEventListener('keydown', arm, { once: true })
    return () => {
      window.removeEventListener('pointerdown', arm)
      window.removeEventListener('keydown', arm)
    }
  }, [camera])
  return null
}
