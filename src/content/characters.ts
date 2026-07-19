/**
 * Character configs for the BlockyCharacter rig (scene/BlockyCharacter.tsx).
 * Everything visual is parameterized here per the style bible / playbook §1 —
 * future NPCs (family & friends, backlog) are new entries in this file, never
 * new scene code. Colors are palette hex; proportions in meters/ratios.
 */

export interface CharacterConfig {
  /** Standing height in meters (chibi characters run short). */
  height: number
  /** Chibi ratio — total height in head-heights (Mii ≈ 2 – 2.5). */
  headsTall: number
  /** Body width multiplier for stockier/slighter builds (default 1). */
  build: number
  colors: {
    skin: string
    hair: string
    /** Shirt/tee. */
    top: string
    /** Shorts/pants. */
    bottom: string
    shoes: string
    eyes: string
  }
  /** Hair shape — 'swoop' is a side-swept fringe under a cap of hair. */
  hair: 'swoop' | 'none'
  /** Thin lens-less rims + bridge, per the bible. */
  glasses?: { color: string }
}

/** Aiden: blonde swoop, thin dark glasses, yellow tee, teal shorts. */
export const AIDEN: CharacterConfig = {
  height: 1.25,
  headsTall: 2.2,
  build: 1,
  colors: {
    skin: '#f6cf9f',
    hair: '#e8c36a',
    top: '#ffd24d',
    bottom: '#35a7a0',
    shoes: '#fff3d6',
    eyes: '#14262b',
  },
  hair: 'swoop',
  glasses: { color: '#14262b' },
}
