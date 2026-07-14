# CLAUDE.md — 3D Planet Portfolio

## What this is

A personal portfolio website that plays like a small game: a tiny low-poly planet at golden hour. The visitor's avatar stands at the top of the sphere and never actually moves — running rotates the whole planet underneath their feet (the Mario Galaxy illusion). An island covers ~35–40% of the planet's surface; the rest is ocean. Portfolio content (photography, code projects, music, YouTube videos, contact) lives inside interactable objects on the island. Built as a static web app, deployed to Vercel.

Owner: Aiden — data analyst / developer (Python, SQL, ETL, Flask, some React).

### Goals, in priority order
1. Memorable and fun within 10 seconds of loading. The rotating planet is the signature.
2. Fast: < 8 MB initial payload; 60 fps desktop, ~30 fps on a mid-tier phone.
3. Content updates never touch scene code — adding a photo or project means editing a file in `src/content/`.
4. Always deployable: every phase ends with a working build on the live URL.

## Tech stack (locked — do not swap without asking)

- Vite + React + TypeScript (strict)
- three.js via `@react-three/fiber` (v9+ pairs with React 19 — check peer deps when installing)
- `@react-three/drei` — useGLTF, Html, Text, PositionalAudio, Cloud, useProgress, PerformanceMonitor, KeyboardControls
- `zustand` — global state
- `nipplejs` (or a ~100-line custom equivalent) — touch joystick
- Tailwind CSS — overlay UI only
- Hosting: GitHub repo → Vercel, auto-deploy on push to `main`

**Removed as of v2:** `ecctrl` and `@react-three/rapier`. They assume a flat world with fixed gravity. Movement is now a custom planet controller (below). Do not reintroduce a physics engine without asking.

Do not add heavy dependencies (postprocessing chains, UI kits, animation libs) without asking first.

## Planet mechanics (the core illusion)

The player is kinematic and fixed at the top pole. All apparent movement is the world rotating.

1. **`<PlanetGroup>`** contains the sphere, island terrain, water, props, interactables, and NPCs, and owns a single quaternion. Camera-relative WASD/joystick input applies an incremental rotation each frame around the axis `cross(worldUp, moveDirection)`, opposite to the input direction.
2. **Avatar** sits at `(0, R, 0)` plus a terrain offset found by a downward three.js `Raycaster` against a low-poly collision mesh (not the visual props). Jump is a cosmetic vertical arc (simple gravity curve) — no physics engine.
3. **Controller code** lives in one hook, `usePlanetController`, target < ~200 lines, with the quaternion math commented and covered by a few vitest unit tests (rotation axis, clamping, angular distance).
4. **Triggers and blockers** use angular distance in planet space: transform each interactable's local position by the current quaternion and compare against the pole. Interaction radius ≈ 2.5 m of arc. Trees/rocks get small blocking radii that cancel the rotation step so you can't walk through them.
5. **Island bounds:** the island is a polar cap covering ~35–40% of the surface. Clamp rotation so the pole can wade a couple of meters past the beach line, then stops.
6. **Sizing:** start with radius ≈ 70 m. Tune radius + rotation speed so running across the island takes ~45–60 s and the horizon curvature is clearly visible. Size is just these two numbers — cheap to retune.
7. **Sell the illusion:** clouds and birds orbit the planet on slow tilted circular paths at altitude; the ocean wraps the whole sphere.

**Documented fallback:** if the rotating-planet approach becomes a tar pit (fighting the camera, triggers, or animation), plan B is reverting to the flat world + ecctrl from Phase 1 and faking curvature with an Animal-Crossing-style vertex shader that bends geometry over the horizon. Decision point: if the core loop (run + look + trigger a prompt) isn't working after the first ~2 sessions of Phase 2, raise the fallback with Aiden instead of grinding.

## Camera & controls

- **Desktop:** third-person follow camera with pointer-lock mouse look. Click the canvas to lock; mouse moves azimuth/pitch (pitch clamped). **Esc releases — this is browser-enforced and cannot be remapped.** Show a brief "click to look around · Esc to free your cursor" hint on first load.
- Opening any modal programmatically exits pointer lock; closing it shows a small "click to resume" affordance.
- A HUD menu toggle switches to drag-to-orbit mode for visitors who dislike pointer lock. Persist the choice in memory (state only, no localStorage assumptions — a settings object in the store is fine).
- **Touch:** left-side virtual joystick to move, right-side drag to orbit. No pointer lock on touch.
- Keyboard: WASD + Space (jump). Movement is camera-relative.

## File structure

```
src/
  main.tsx, App.tsx
  scene/        # Planet.tsx, Island.tsx, Water.tsx, Avatar.tsx, Interactable.tsx,
                # AmbientLife.tsx (birds/clouds/NPCs), Lighting.tsx, Wayfinding.tsx
  controls/     # usePlanetController.ts, usePointerLockCamera.ts, TouchJoystick.tsx
  ui/           # LoadingScreen.tsx, Hud.tsx, PromptE.tsx
  ui/modals/    # GalleryModal.tsx, ProjectsModal.tsx, MusicModal.tsx, VideosModal.tsx,
                # ContactModal.tsx, CardModal.tsx
  content/      # interactables.ts, photos.ts, projects.ts, music.ts, videos.ts,
                # contact.ts, about.ts   (npcs.ts in backlog)
  store/        # useStore.ts
  classic/      # ClassicPage.tsx (code-split, no three.js in its chunk)
public/
  models/       # draco-compressed .glb
  photos/       # WebP, max 1600px long edge, lazy-loaded
  audio/        # ogg/mp3, loaded lazily
```

## Art direction

**Vibe:** warm low-poly planet at golden hour. Flat-shaded materials, gentle fog, gradient sky, visible horizon curve. The planet is the signature — the overlay UI stays quiet and disciplined so the world does the talking.

**Palette (named tokens, use everywhere):**
- `sand` #E8D5A3 · `palm` #55A05F · `lagoon` #35A7A0 · `deepwater` #1D6E73
- `sunset` #FFB870 (sky horizon, in-world light accents only)
- `ink` #14262B (UI text / panels); UI accent = `lagoon` (keep the sunset in the world, not the chrome)

**Overlay typography:** display = Bricolage Grotesque (headers, HUD labels, 1–2 weights max); body = Atkinson Hyperlegible with system-ui fallback. No other font families.

**Signature moment:** on load, the camera starts out in space looking at the whole planet, then swoops down and settles behind the avatar at the pole as the planet eases into place. One orchestrated intro; no other gratuitous animation. Respect `prefers-reduced-motion` — skip the swoop, fade in instead.

## World design — the island cap

- **Spawn:** beach with a campfire and log bench. Ukulele leans against the log → MUSIC. A guitarist NPC sits on the bench (ambient life, not an interactable — the ukulele is the portal).
- **Wooden dock** toward the water line. Camera on a tripod at the end, facing the sunset → PHOTOGRAPHY. Mailbox at the dock entrance → CONTACT.
- **Palapa / lean-to** with a desk and glowing monitor → PROJECTS.
- **Grassy rise** with one big tree; gymnastics rings hang from a branch → ABOUT/MOVEMENT (short card).
- **Old CRT TV on a crate** near the rocks, absurdly running on island power → YOUTUBE.
- Scatter props: palms, rocks, shells, grass tufts (instanced), a beached rowboat.
- Ocean: sphere-wrapping water with a cheap animated material and shallow-water band at the beach.

**Wayfinding:** a small bobbing icon floats above each interactable. First-visit HUD hint: "WASD / drag to move — walk up to things and press E." Hint disappears after `hasMoved`.

## Ambient life

- **Guitarist NPC** on the log bench: idle guitar-playing animation, looping strum track via drei `<PositionalAudio>` (refDistance ≈ 4, exponential rolloff) so it swells as you approach and fades as you leave.
- **Birds:** 2–3 low-poly birds with flap animation on tilted orbital paths around the planet.
- **Clouds:** slow low-poly clouds orbiting at altitude.
- All audio starts only after the first user gesture (browser autoplay rules). Global mute toggle in the HUD.

## Interaction flow

Player nears an object (angular distance ≤ threshold) → `nearbyId` set → HUD shows `[E] {label}` (mobile: a tap button). Press E / tap / click the mesh (R3F pointer events) → `openModalId` set → overlay opens, pointer lock exits, controls pause, world keeps idling behind. Esc or close returns to the world. Focus trapped in modals; visible keyboard focus states everywhere.

## Content model

`interactables.ts` entry shape:
`{ id, label, prompt, modelPath, position, rotation, modal: 'gallery' | 'projects' | 'music' | 'videos' | 'contact' | 'card', contentKey }`
(`position` is planet-local; a helper converts lat/long-style placement to coordinates so placing objects is sane.)

Content files (the only files edited for routine updates):
- `photos.ts` — `[{ src, alt, caption?, location? }]`
- `projects.ts` — `[{ title, blurb, tech: string[], link?, repo? }]`
- `music.ts` — `[{ title, embedUrl?, audioSrc? }]`
- `videos.ts` — `[{ title, youtubeId }]` — thumbnail first, iframe injected on click (lite-embed)
- `contact.ts` — `{ email, links: [{ label, url }] }`
- `about.ts` — short bio card copy for the rings

Modals: gallery = responsive grid + lightbox with arrow-key nav and lazy images; projects = simple cards; videos = lite-embeds; contact = mailto + links. Plain verbs on buttons ("Close", "Next photo"), sentence case, no filler copy.

## Player avatar

- Now: placeholder capsule character is fine.
- Phase 3: the avatar becomes Aiden. First choice: retexture/recolor a low-poly character (hair, skin tone, outfit) so it reads as him while staying cohesive with the flat-shaded style. Alternative: Ready Player Me selfie avatar exported as glTF — test that its semi-realistic look doesn't clash with the art style before committing. Same animation clips (idle/walk/run/jump) either way.

## /classic fallback (SEO + accessibility)

- Route `/classic` renders the same content files as a normal one-page portfolio. Its chunk must not import three.js.
- Link to it from the loading screen and the HUD menu ("View classic site").
- If WebGL is unavailable, redirect to `/classic` automatically.
- Meta + Open Graph tags (title, description, preview image) live on both routes.

## Assets

- **Characters:** Quaternius animated low-poly packs (CC0) for placeholder + NPC; Mixamo for extra clips (e.g., guitar playing) retargeted as needed.
- **Props/nature/birds:** Kenney kits, Poly Pizza, Quaternius. Prefer CC0; keep a `CREDITS.md` regardless.
- **Compress every model:** `npx gltf-transform optimize in.glb out.glb --compress draco`.
- Budgets: all models combined < 4 MB; photos and audio are lazy-loaded and never part of the initial payload.

## Performance

- Rotating the planet is one group transform — cheap. Raycast only against a dedicated low-poly collision mesh, never the full prop set.
- Instance repeated props (palms, rocks, grass) — `InstancedMesh` inside the rotating group is fine.
- Clamp DPR to [1, 2]; drei `PerformanceMonitor` drops `qualityTier` on weak devices.
- One directional light + ambient. No shadow maps on the mobile tier; cheap blob/contact shadows under the avatar and key props only.
- Suspense everywhere; loading screen driven by `useProgress` (planet silhouette + percentage).

## Phases and acceptance criteria

**Phase 1 — Walkable gray box** ✅ DONE (flat plane + ecctrl). Superseded by the planet pivot; its only surviving artifacts are the deploy pipeline and modal shell.

**Phase 2 — Planet migration + all interactions**
Remove ecctrl and rapier (separate commit). Implement `usePlanetController` + pointer-lock camera + touch joystick. Block out the planet and island cap with primitives. All six interactables placed from data with angular triggers and working modal types (placeholder content). `/classic` route live and code-split.
✓ Done when: a live URL where you can run around the planet with visible horizon curve, mouse-look works (click to lock, Esc to release), every object opens its modal, and it plays on a phone.

**Phase 3 — Art and feel**
Real glTF props, Aiden avatar, guitarist NPC + positional audio, birds and clouds orbiting, lighting/sky/fog/palette per art direction, space-to-pole camera intro, wayfinding icons, ambient sound + mute, contact shadows, perf pass on a real phone.
✓ Done when: 60 fps desktop / ~30 fps mid phone, < 8 MB initial payload.

**Phase 4 — Content and launch**
Real photos, projects, music, videos, contact. Meta/OG tags, favicon, custom domain, lightweight analytics, `CREDITS.md`.
✓ Done when: the shared link previews nicely and everything on the island is real.

## Backlog (post-launch, do not build yet)

- **Family & friends NPCs:** data-driven `npcs.ts` — `[{ id, name, model, position, voiceSrc, caption }]`. Interacting plays a short recorded voice note (positional audio) with an on-screen caption/transcript for accessibility. Ship only with each person's explicit okay — this is a public site.
- Day/night toggle; more ambient critters; footprints in sand.

## Working conventions

- Small components; scene components only reach content through the interactables map.
- All quaternion/planet math stays in `controls/`, commented, with vitest coverage for the tricky parts.
- TypeScript strict, no `any`.
- Commit per working feature; `main` stays deployable. The ecctrl/rapier removal is its own commit before any planet code lands.
- Ask before adding dependencies or changing art direction.
- After any control or UI change, test in a mobile viewport before calling it done.
