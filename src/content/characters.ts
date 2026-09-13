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
    /** Fur trim on a parka — hem band, cuffs, hood ring (defaults to top). */
    trim?: string
    /** Mitten color for the parka outfit (defaults to top). */
    mittens?: string
  }
  /** Hair shape — 'swoop' = side-swept fringe under a cap; 'bob' = the
   * feminine villager cap dropping past the ears with a straight fringe. */
  hair: 'swoop' | 'bob' | 'none'
  /** 'tee-shorts' = egg tee + shorts band; 'dress' = bodice + flared
   * cone skirt (the feminine villager silhouette); 'parka' = a fuller
   * teardrop in the top color with a fur hem, full sleeves with fur
   * cuffs, mittens and tall boots (the Antarctica outpost). */
  outfit: 'tee-shorts' | 'dress' | 'parka'
  /** Fur-lined hood up, framing the face — hides the hair and the ears. */
  hood?: boolean
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
  /** Hip half-width as a fraction of head width (0.365). */
  hipFrac?: number
  /** Mid-torso slimming, 0–0.6 (0.28). */
  waistSlim?: number
  /** Torso depth squash — side-profile slimness (0.78). */
  torsoDepth?: number
  /** Bridge seat 0–1: 0 = at eye height, 1 = resting on the nose (1). */
  glassesSeat?: number
  /** Eye style: 'dark' AC oval, or 'normal' layered white/iris/pupil
   * (the Raymond read). Default 'dark'. */
  eyeStyle?: 'dark' | 'normal'
  /** Iris ring color for eyeStyle 'normal' (#5b8fe3). */
  irisColor?: string
  /** Upper-eyelid coverage for eyeStyle 'normal', 0–0.5 (0.28). */
  lidHeight?: number
  /** Frame style when `glasses` is set: bold rounded-rect boxes
   * (Raymond) or thin round tori. Default 'bold-rect'. */
  glassesStyle?: 'bold-rect' | 'round' | 'none'
  /** Arm length as a fraction of torso height (0.87). */
  armLenFrac?: number
  /** Elbow bend at idle, degrees (8 — essentially straight). */
  elbowRestBend?: number
  /** Elbow bend walking, degrees (25). */
  elbowBendWalk?: number
  /** Elbow bend running, degrees (70 — the classic pump). */
  elbowBendRun?: number
  /** Forearm follow-through with the arm swing, 0–1 (0.35). */
  elbowSwing?: number
  /** Ball hand radius multiplier on the base 1.4×armR (1.12). */
  handScale?: number
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
  eyeStyle: 'normal',
  irisColor: '#5b8fe3',
  glasses: { color: '#2a2c30' },
  glassesStyle: 'bold-rect',
}

/** Koa — the ukulele player on the dock (3C's first villager).
 * Authored in the Character Studio and exported here: friendly beach
 * musician, palette deliberately distinct from Aiden (coral tee, warm
 * brown swoop, cream shorts, blush, no glasses). */
export const KOA: CharacterConfig = {
  height: 1.22,
  headsTall: 2.0,
  build: 1.02,
  colors: {
    skin: '#e8b98a',
    hair: '#5a4632',
    top: '#ff8c5a',
    bottom: '#f5e9d0',
    shoes: '#8a5a3a',
    eyes: '#2b1c14',
  },
  hair: 'swoop',
  outfit: 'tee-shorts',
  eyeStyle: 'dark',
  blush: true,
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

// ---- Inuit-inspired villagers for the Antarctica outpost -------------
// Two parka'd villagers for the south-pole outpost. Both wear the hood
// up, so their hair never renders — the field stays set anyway, because
// a hood is a garment and not a haircut: lowering it must not leave a
// bald villager behind.

/** Nanuq — the outpost's wanderer: lagoon-blue parka, cream fur trim. */
export const NANUQ: CharacterConfig = {
  height: 1.26,
  headsTall: 2.0,
  build: 1.05,
  colors: {
    skin: '#d9a06c',
    hair: '#211610',
    top: '#5aa7d6',
    bottom: '#3d5a68',
    shoes: '#5a4632',
    eyes: '#2b1c14',
    trim: '#fff3d6',
    mittens: '#2b3a42',
  },
  hair: 'swoop',
  outfit: 'parka',
  hood: true,
  eyeStyle: 'dark',
  blush: true,
}

/** Sila — the outpost's watcher: coral parka, the same cream fur. */
export const SILA: CharacterConfig = {
  height: 1.2,
  headsTall: 2.0,
  build: 0.96,
  colors: {
    skin: '#e8b98a',
    hair: '#2b1c14',
    top: '#ff8c5a',
    bottom: '#8f4f33',
    shoes: '#5a4632',
    eyes: '#2b1c14',
    trim: '#fff3d6',
    mittens: '#8f4f33',
  },
  hair: 'bob',
  outfit: 'parka',
  hood: true,
  eyeStyle: 'normal',
  irisColor: '#6b4a2b',
  blush: true,
}
