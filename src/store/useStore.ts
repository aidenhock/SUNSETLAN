import { create } from 'zustand'

export type QualityTier = 'high' | 'low'
export type CameraMode = 'pointerLock' | 'orbit'

interface AppState {
  /** Interactable the player is standing near, if any. */
  nearbyId: string | null
  /** Log circle index the player is near (sit prompt), if any. */
  nearbyLog: number | null
  /** Seat id from scene/seats.ts while seated at the fire, else null. */
  seatedSeatId: string | null
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
  setNearbyLog: (index: number | null) => void
  sitDown: (seatId: string) => void
  standUp: () => void
  openModal: (id: string) => void
  closeModal: () => void
  setMuted: (muted: boolean) => void
  setQualityTier: (tier: QualityTier) => void
  markMoved: () => void
  finishIntro: () => void
  setPointerLocked: (locked: boolean) => void
  setCameraMode: (mode: CameraMode) => void
}

/** Mute persists across visits (3C); everything else is session state. */
const persistedMute = (() => {
  try {
    return localStorage.getItem('sl-muted') === '1'
  } catch {
    return false
  }
})()

export const useStore = create<AppState>((set) => ({
  nearbyId: null,
  nearbyLog: null,
  seatedSeatId: null,
  openModalId: null,
  muted: persistedMute,
  qualityTier: 'high',
  hasMoved: false,
  introDone: false,
  pointerLocked: false,
  settings: { cameraMode: 'pointerLock' },
  setNearby: (id) => set({ nearbyId: id }),
  setNearbyLog: (index) => set({ nearbyLog: index }),
  sitDown: (seatId) => set({ seatedSeatId: seatId }),
  standUp: () => set({ seatedSeatId: null }),
  openModal: (id) => set({ openModalId: id }),
  closeModal: () => set({ openModalId: null }),
  setMuted: (muted) => {
    try {
      localStorage.setItem('sl-muted', muted ? '1' : '0')
    } catch {
      // Private-mode storage failures never block the toggle.
    }
    set({ muted })
  },
  setQualityTier: (qualityTier) => set({ qualityTier }),
  markMoved: () => set({ hasMoved: true }),
  finishIntro: () => set({ introDone: true }),
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  setCameraMode: (cameraMode) => set({ settings: { cameraMode } }),
}))
