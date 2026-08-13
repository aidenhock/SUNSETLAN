# Credits

## Art

All 3D art — characters, props, terrain, sky, water, clouds, fire — is
hand-built from three.js primitives (boxes, rounded boxes, cylinders,
cones, icosahedra). Nothing is an imported model, and no image textures
are used (per-face vertex colors and procedurally generated canvas tiles
only). The character rig and several scene techniques (rounded-primitive
character construction, box-cluster clouds, the base lighting recipe)
draw on published tutorials rather than being derived from scratch — see
`docs/style-playbook.md` for the full technique writeup, primarily:

- Codrops, "Creating 3D Characters in Three.js" (Barker, 2021) —
  https://tympanus.net/codrops/2021/10/04/creating-3d-characters-in-three-js
- Codrops, "The Aviator: Animating a Basic 3D Scene with Three.js"
  (Maaloul, 2016) —
  https://tympanus.net/codrops/2016/04/26/the-aviator-animating-basic-3d-scene-threejs
  (reference implementation: https://github.com/yakudoo/TheAviator)

## Audio

**Rule: only license-clean sources ever ship.** Every audio file in
`src/assets/audio/` must be listed here with its source and license
before it reaches `main`.

### Owner-provided library

The sound library — waves, seagulls, campfire, splash, and all footstep
pools — consists of **Aiden's own recordings and cuts**, ingested via
`scripts/ingest-audio.mjs`. Owner-provided; all rights held by the site
owner.

| Files | Count | Source | License |
|---|---|---|---|
| `waves/waves-*.mp3` | 7 | Aiden — own recordings/cuts | owner-provided |
| `seagulls/seagulls-*.mp3` | 8 | Aiden — own recordings/cuts | owner-provided |
| `campfire/campfire-*.mp3` | 4 | Aiden — own recordings/cuts | owner-provided |
| `splash/splash-*.mp3` | 15 | Aiden — own recordings/cuts | owner-provided |
| `footsteps-grass/*.mp3` | 31 | Aiden — own recordings/cuts | owner-provided |
| `footsteps-sand/*.mp3` | 26 | Aiden — own recordings/cuts | owner-provided |
| `footsteps-dock/*.mp3` | 44 | Aiden — own recordings/cuts | owner-provided |
| **Total** | **135** | | |

The `music`, `crabs`, and `ui` pools are empty today — those categories
currently run entirely on the procedural fallbacks below until Aiden
drops files into `src/assets/audio/<category>/`.

### Procedural / generative sources

Every audio category also has a synthesized fallback, generated in-code
(`src/audio/procedural.ts`) and registered per category
(`registerProceduralFallbacks`) so the mechanic works even where no file
pool exists yet; `waves`, `seagulls`, and `campfire` keep their generated
fallback in the rotation even though real recordings exist. All are
seeded (`mulberry32`) for determinism.

| Category | Technique |
|---|---|
| `music` | Generative lo-fi pad loop — stacked detuned sine partials in cyclically wrapped raised-cosine windows over an island I–vi–IV–V chord table, seamless by construction, with sparse Karplus-Strong plucks layered in |
| `waves` | Shaped/filtered noise swell, seamless 3 s cycle |
| `seagulls` | Two-note pitch-swept sine cry |
| `campfire` | Lowpassed noise bed with sparse crackle pops (shaped noise bursts) |
| `crabs` | Two sharp shaped-noise pincer clicks |
| `splash` | Single shaped noise burst |
| `ui` | Short downward sine sweep (blip) |
| `footsteps-grass` / `footsteps-sand` / `footsteps-dock` | Shaped noise burst tuned per surface (dock adds a low sine "knock" for a hollow/woody read) |

The ukulele voice specifically (used by the music pad and, procedurally,
anywhere a plucked/strummed tone is needed) is **Karplus-Strong string
synthesis**: a noise-seeded delay ring filtered per pluck (`fillPluck`),
staggered into strums across a small chord table (`fillStrum`,
`UKE_CHORDS`).

### Third-party template

Add new third-party entries in this exact form before any such file
ships (no entry, no ship):

| File | Source | License | Link |
|---|---|---|---|
| `music/lofi-loop.mp3` | *(artist — track)* | *(e.g. CC BY 4.0)* | *(url)* |

## Fonts

Declared in `src/index.css` as the `--font-display` / `--font-body`
theme tokens (Tailwind v4 `@theme`); loading them (a `<link>`,
`@font-face`, or a local font file) is not yet wired up in `index.html`
or elsewhere in the repo, so both currently fall back to the browser's
`system-ui` font. Credited here so the fallback is a temporary gap, not
a forgotten source, once loading is added:

| Font | Role | Author | License |
|---|---|---|---|
| Bricolage Grotesque | `--font-display` (headings, buttons, UI chrome) | Mathieu Triay | SIL Open Font License 1.1 |
| Atkinson Hyperlegible | `--font-body` (body text) | Braille Institute of America | SIL Open Font License 1.1 |

## Libraries

Runtime dependencies (`package.json`), all MIT-licensed:

| Library | Role |
|---|---|
| [three.js](https://threejs.org/) | 3D engine |
| [React](https://react.dev/) | UI framework |
| [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber) | React renderer for three.js |
| [@react-three/drei](https://github.com/pmndrs/drei) | R3F helper components |
| [zustand](https://github.com/pmndrs/zustand) | App state store |
| [Tailwind CSS](https://tailwindcss.com/) (+ `@tailwindcss/vite`) | Overlay/UI styling |

Build and test tooling (`devDependencies`):

| Tool | Role | License |
|---|---|---|
| [Vite](https://vitejs.dev/) (+ `@vitejs/plugin-react`) | Build tool / dev server | MIT |
| [TypeScript](https://www.typescriptlang.org/) | Language / type checking | Apache-2.0 |
| [Vitest](https://vitest.dev/) | Unit test runner | MIT |
| [Playwright](https://playwright.dev/) (`@playwright/test`) | E2E test runner | Apache-2.0 |
| [r3f-perf](https://github.com/utsuboco/r3f-perf) | Dev-only perf overlay (`?perf`) | MIT |

No other runtime dependencies are used — no physics engine, no
postprocessing stack, no audio library (three.js's own `AudioListener` /
`PositionalAudio` cover the audio system).
