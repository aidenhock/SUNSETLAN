import { create } from 'zustand'
import type { DockName } from '../scene/boat'

export type QualityTier = 'high' | 'low'
export type CameraMode = 'pointerLock' | 'orbit'

/**
 * The boat's whole life: which dock it is tied to, and whether the
 * player is walking, climbing aboard, driving, or tying up. 'boarding'
 * and 'landing' are the tween windows the controller owns.
 */
export interface BoatState {
  state: 'moored' | 'boarding' | 'driving' | 'landing'
  at: DockName
}

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
  /** The boat — moored at a dock until someone climbs in. */
  boat: BoatState
  /** On foot, standing beside the moored boat (board prompt). */
  nearbyBoat: boolean
  /** Driving, and close enough to a dock's end to tie up there. */
  nearbyDockFromBoat: DockName | null
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
  boardBoat: () => void
  tieUp: (dock: DockName) => void
  setNearbyBoat: (near: boolean) => void
  setNearbyDockFromBoat: (dock: DockName | null) => void
  /** Internal: the controller advances the boat past its tweens. */
  setBoatState: (state: BoatState['state']) => void
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
  boat: { state: 'moored', at: 'north' },
  nearbyBoat: false,
  nearbyDockFromBoat: null,
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
  // Boarding and tying up are both TWEEN starts: the controller watches
  // this state, glides the world, and reports back through setBoatState.
  boardBoat: () =>
    set((s) =>
      s.boat.state === 'moored'
        ? {
            boat: { ...s.boat, state: 'boarding' },
            nearbyBoat: false,
            nearbyId: null,
            nearbyLog: null,
          }
        : {},
    ),
  tieUp: (dock) =>
    set((s) =>
      s.boat.state === 'driving'
        ? { boat: { state: 'landing', at: dock }, nearbyDockFromBoat: null }
        : {},
    ),
  setNearbyBoat: (nearbyBoat) => set({ nearbyBoat }),
  setNearbyDockFromBoat: (nearbyDockFromBoat) => set({ nearbyDockFromBoat }),
  setBoatState: (state) => set((s) => ({ boat: { ...s.boat, state } })),
}))
