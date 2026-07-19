import { create } from 'zustand'

export type QualityTier = 'high' | 'low'
export type CameraMode = 'pointerLock' | 'orbit'

interface AppState {
  /** Interactable the player is standing near, if any. */
  nearbyId: string | null
  /** Interactable whose modal is open, if any. Controls are disabled while set. */
  openModalId: string | null
  muted: boolean
  qualityTier: QualityTier
  /** True once the player has moved for the first time (hides the intro hint). */
  hasMoved: boolean
  /** True once the intro swoop has finished (or was skipped): controls live. */
  introDone: boolean
  /** True while the browser pointer lock is held by the canvas. */
  pointerLocked: boolean
  /** Visitor-tunable settings; state only, no localStorage assumptions. */
  settings: { cameraMode: CameraMode }
  setNearby: (id: string | null) => void
  openModal: (id: string) => void
  closeModal: () => void
  setMuted: (muted: boolean) => void
  setQualityTier: (tier: QualityTier) => void
  markMoved: () => void
  finishIntro: () => void
  setPointerLocked: (locked: boolean) => void
  setCameraMode: (mode: CameraMode) => void
}

export const useStore = create<AppState>((set) => ({
  nearbyId: null,
  openModalId: null,
  muted: true,
  qualityTier: 'high',
  hasMoved: false,
  introDone: false,
  pointerLocked: false,
  settings: { cameraMode: 'pointerLock' },
  setNearby: (id) => set({ nearbyId: id }),
  openModal: (id) => set({ openModalId: id }),
  closeModal: () => set({ openModalId: null }),
  setMuted: (muted) => set({ muted }),
  setQualityTier: (qualityTier) => set({ qualityTier }),
  markMoved: () => set({ hasMoved: true }),
  finishIntro: () => set({ introDone: true }),
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  setCameraMode: (cameraMode) => set({ settings: { cameraMode } }),
}))
