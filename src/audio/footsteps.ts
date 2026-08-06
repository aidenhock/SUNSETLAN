import { FOOTSTEPS, type Surface } from '../scene/planetConfig'
import { play2d, playDoubleTap, type Category } from './core'

/**
 * Surface-switched footsteps (CLAUDE.md 3C): callers resolve the
 * surface via surfaceUnderfoot (analytic bands) and hand it here —
 * this module only maps surface → pool and plays. Wade steps are
 * per-step splashes.
 */

export function surfaceToCategory(surface: Surface): Category {
  if (surface === 'wade') return 'splash'
  if (surface === 'dock') return 'footsteps-dock'
  return surface === 'grass' ? 'footsteps-grass' : 'footsteps-sand'
}

/** One foot plant. Sprint is naturally faster-cadenced (anim-driven)
 * and slightly louder here. */
export function stepSound(surface: Surface, sprint: boolean) {
  // e2e cadence probe.
  const w = window as unknown as { __stepLog?: Array<{ t: number; surface: string }> }
  ;(w.__stepLog ??= []).push({ t: performance.now(), surface })
  if (w.__stepLog.length > 64) w.__stepLog.shift()
  void play2d(
    surfaceToCategory(surface),
    'world',
    sprint ? FOOTSTEPS.stepGainSprint : FOOTSTEPS.stepGainWalk,
  )
}

/** Takeoff/landing double-tap — two different picks ~90 ms apart;
 * landing slightly louder, never one heavy thud. */
export function jumpTaps(surface: Surface, landing: boolean) {
  const base = FOOTSTEPS.stepGainWalk * (landing ? 1.25 : 1.05)
  void playDoubleTap(surfaceToCategory(surface), 'world', base, FOOTSTEPS.jumpTapGapMs)
}
