import { create } from 'zustand'

export type QualityTier = 'high' | 'low'

interface AppState {
  /** Interactable the player is standing near, if any. */
  nearbyId: string | null
  /** Interactable whose modal is open, if any. Controls are disabled while set. */
  openModalId: string | null
  muted: boolean
  qualityTier: QualityTier
  /** True once the player has moved for the first time (hides the intro hint). */
  hasMoved: boolean
  setNearby: (id: string | null) => void
  openModal: (id: string) => void
  closeModal: () => void
  setMuted: (muted: boolean) => void
  setQualityTier: (tier: QualityTier) => void
  markMoved: () => void
}

export const useStore = create<AppState>((set) => ({
  nearbyId: null,
  openModalId: null,
  muted: true,
  qualityTier: 'high',
  hasMoved: false,
  setNearby: (id) => set({ nearbyId: id }),
  openModal: (id) => set({ openModalId: id }),
  closeModal: () => set({ openModalId: null }),
  setMuted: (muted) => set({ muted }),
  setQualityTier: (qualityTier) => set({ qualityTier }),
  markMoved: () => set({ hasMoved: true }),
}))
