/**
 * Character configs for the BlockyCharacter rig (scene/BlockyCharacter.tsx).
 * Everything visual is parameterized here per the style bible / playbook §1
 * (Character 2.0 rounded recipe) — future NPCs (family & friends, backlog)
 * are new entries in this file, never new scene code. Colors are palette
 * hex; proportions in meters/ratios.
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
    /** Shirt/tee (or dress bodice). */
    top: string
    /** Shorts/pants (or skirt). */
    bottom: string
    shoes: string
    eyes: string
  }
  /** Hair shape — 'swoop' = side-swept fringe under a cap; 'bob' = the
   * feminine villager cap dropping past the ears with a straight fringe. */
  hair: 'swoop' | 'bob' | 'none'
  /** 'tee-shorts' = egg tee + shorts band; 'dress' = bodice + flared
   * cone skirt (the feminine villager silhouette). */
  outfit: 'tee-shorts' | 'dress'
  /** Flattened pink cheek discs (AC blush). */
  blush?: boolean
  /** Thin lens-less round rims + bridge, per the bible. */
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
  outfit: 'tee-shorts',
  glasses: { color: '#14262b' },
}

/** Feminine villager demo (the AC reference pair's second model) — the
 * template future female NPCs start from. */
export const ROSE: CharacterConfig = {
  height: 1.22,
  headsTall: 2.2,
  build: 0.96,
  colors: {
    skin: '#f6cf9f',
    hair: '#f2a7c3',
    top: '#d94f4f',
    bottom: '#f5f0e6',
    shoes: '#c9a06a',
    eyes: '#2b1c14',
  },
  hair: 'bob',
  outfit: 'dress',
  blush: true,
}
