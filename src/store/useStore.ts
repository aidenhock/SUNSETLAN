import { create } from 'zustand'

export type QualityTier = 'high' | 'low'
export type CameraMode = 'pointerLock' | 'orbit'

interface AppState {
  /** Interactable the player is standing near, if any. */
  nearbyId: string | null
  /** Log circle index the player is near (sit prompt), if any. */
  nearbyLog: number | null
  /** Free seat position ({ log, offsetM } per scene/seats.ts) while
   * seated at the fire, else null. */
  seatedSeat: { log: number; offsetM: number } | null
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
  /** Minimap HUD: visibility persists. The map shows the whole island —
   * no exploration state, by the owner's call. */
  minimapVisible: boolean
  /** True while the player is inside the build-log room (a separate
   * walkable space; the island stops rendering). */
  inRoom: boolean
  /** Mural the player is standing in front of, inside the room. */
  nearbyMural: string | null
  /** True when standing in the rift at the room's centre (the way out). */
  nearbyRoomExit: boolean
  setNearby: (id: string | null) => void
  setNearbyLog: (index: number | null) => void
  sitDown: (seat: { log: number; offsetM: number }) => void
  standUp: () => void
  openModal: (id: string) => void
  closeModal: () => void
  setMuted: (muted: boolean) => void
  setQualityTier: (tier: QualityTier) => void
  markMoved: () => void
  finishIntro: () => void
  setPointerLocked: (locked: boolean) => void
  setCameraMode: (mode: CameraMode) => void
  toggleMinimap: () => void
  enterRoom: () => void
  exitRoom: () => void
  setNearbyMural: (id: string | null) => void
  setNearbyRoomExit: (near: boolean) => void
}

/** Mute persists across visits (3C); everything else is session state. */
const persistedMute = (() => {
  try {
    return localStorage.getItem('sl-muted') === '1'
  } catch {
    return false
  }
})()

/** Minimap starts ON unless the visitor turned it off before. */
const persistedMinimap = (() => {
  try {
    return localStorage.getItem('sl-minimap-on') !== '0'
  } catch {
    return true
  }
})()

export const useStore = create<AppState>((set) => ({
  nearbyId: null,
  nearbyLog: null,
  seatedSeat: null,
  openModalId: null,
  muted: persistedMute,
  qualityTier: 'high',
  hasMoved: false,
  introDone: false,
  pointerLocked: false,
  settings: { cameraMode: 'pointerLock' },
  minimapVisible: persistedMinimap,
  inRoom: false,
  nearbyMural: null,
  nearbyRoomExit: false,
  setNearby: (id) => set({ nearbyId: id }),
  setNearbyLog: (index) => set({ nearbyLog: index }),
  sitDown: (seat) => set({ seatedSeat: seat }),
  standUp: () => set({ seatedSeat: null }),
  // Stepping into the rift is a place, not a dialog: the same E press
  // and the same click that open every other interactable's modal put
  // the player INSIDE the room instead.
  openModal: (id) =>
    id === 'rift' ? set({ inRoom: true, nearbyId: null }) : set({ openModalId: id }),
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
  toggleMinimap: () =>
    set((s) => {
      const next = !s.minimapVisible
      try {
        localStorage.setItem('sl-minimap-on', next ? '1' : '0')
      } catch {
        // No-storage environments just lose the preference.
      }
      return { minimapVisible: next }
    }),
  enterRoom: () => set({ inRoom: true, nearbyId: null }),
  exitRoom: () =>
    set({ inRoom: false, nearbyMural: null, nearbyRoomExit: false, openModalId: null }),
  setNearbyMural: (nearbyMural) => set({ nearbyMural }),
  setNearbyRoomExit: (nearbyRoomExit) => set({ nearbyRoomExit }),
}))
