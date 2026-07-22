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
  /** Ear lobe scale (default 1). */
  earSize?: number
  /** Tiny peach nose above the mouth (default 'round'). */
  noseStyle?: 'round' | 'none'
  /** Thin lens-less round rims + bridge, per the bible. */
  glasses?: { color: string }
  // ---- Studio dials (all optional; rig defaults in parentheses) ----
  /** Head volume scale (1). */
  headScale?: number
  /** Eye group scale (1). */
  eyeScale?: number
  /** Glasses rim scale (1). */
  glassesScale?: number
  /** Nose scale (1). */
  noseSize?: number
  /** Sleeve cap length factor (1; 0 = sleeveless). */
  sleeveLen?: number
  /** Rest A-pose arm angle, degrees out from the body (28). */
  armRestDeg?: number
  /** Arm/leg thickness factor (1). */
  limbThick?: number
  /** Shoulder half-width as a fraction of head width (0.242). */
  shoulderFrac?: number
  /** Hip half-width as a fraction of head width (0.39). */
  hipFrac?: number
  /** Mid-torso slimming, 0–0.6 (0.2 ≈ the v3.19 −8–10% waist). */
  waistSlim?: number
  /** Bridge seat 0–1: 0 = at eye height, 1 = resting on the nose (1). */
  glassesSeat?: number
  /** Ear height as a fraction of head height (0.52 — the midline). */
  earY?: number
  /** Ear outward-upward tilt in degrees (12). */
  earTilt?: number
  /** Visible neck length in meters (default 0 — AC style, head sits on the torso). */
  neckLength?: number
}

/** Aiden: blonde swoop, thin dark glasses, yellow tee, teal shorts. */
export const AIDEN: CharacterConfig = {
  height: 1.25,
  headsTall: 2.0,
  build: 1,
  colors: {
    skin: '#f6cf9f',
    hair: '#e8c36a',
    top: '#ffd24d',
    bottom: '#35a7a0',
    shoes: '#fff3d6',
    eyes: '#2b1c12',
  },
  hair: 'swoop',
  outfit: 'tee-shorts',
  glasses: { color: '#14262b' },
}

/** Feminine villager demo (the AC reference pair's second model) — the
 * template future female NPCs start from. */
export const ROSE: CharacterConfig = {
  height: 1.22,
  headsTall: 2.0,
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
