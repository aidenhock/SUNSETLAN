# CLAUDE.md — 3D Island Portfolio

## What this is

A personal portfolio website that plays like a small game: a low-poly island at golden hour that visitors explore as a third-person avatar. Portfolio content (photography, code projects, music, YouTube videos, contact) lives inside interactable objects scattered around the island. Built as a static web app, deployed to Vercel. Same spirit as bruno-simon.com, but avatar-on-an-island instead of a car.

Owner: Aiden — data analyst / developer (Python, SQL, ETL, Flask, some React).

### Goals, in priority order
1. Memorable and fun within 10 seconds of loading.
2. Fast: < 8 MB initial payload; 60 fps desktop, ~30 fps on a mid-tier phone.
3. Content updates never touch scene code — adding a photo or project means editing a file in `src/content/`.
4. Always deployable: every phase ends with a working build on the live URL.

## Tech stack (locked — do not swap without asking)

- Vite + React + TypeScript (strict)
- three.js via `@react-three/fiber` (v9+ pairs with React 19 — check peer deps when installing)
- `@react-three/drei` — useGLTF, Html, Text, useProgress, PerformanceMonitor, KeyboardControls
- `@react-three/rapier` — physics
- `ecctrl` — third-person character controller (keyboard + built-in touch joystick)
- `zustand` — global state
- Tailwind CSS — overlay UI only
- Hosting: GitHub repo → Vercel, auto-deploy on push to `main`

Do not add heavy dependencies (postprocessing chains, UI kits, animation libs) without asking first.

## Architecture rules

1. **Two separate trees.** `<Canvas>` renders the 3D world. All readable content — galleries, project cards, contact — renders as HTML overlays *outside* the canvas. Never build text-heavy UI inside WebGL.
2. **Interactables are data.** Scene code maps over `src/content/interactables.ts`. No portfolio content hardcoded in scene components, ever.
3. **One zustand store:** `nearbyId`, `openModalId`, `muted`, `qualityTier`, `hasMoved`. While a modal is open, player controls are disabled and the world keeps idling in the background.
4. **Player** = ecctrl capsule + animated character glTF (idle / walk / run / jump), ecctrl's default follow camera.

## File structure

```
src/
  main.tsx, App.tsx
  scene/        # Island.tsx, Water.tsx, Player.tsx, Interactable.tsx, Lighting.tsx, Wayfinding.tsx
  ui/           # LoadingScreen.tsx, Hud.tsx, PromptE.tsx
  ui/modals/    # GalleryModal.tsx, ProjectsModal.tsx, MusicModal.tsx, VideosModal.tsx, ContactModal.tsx, CardModal.tsx
  content/      # interactables.ts, photos.ts, projects.ts, music.ts, videos.ts, contact.ts, about.ts
  store/        # useStore.ts
  classic/      # ClassicPage.tsx (code-split, no three.js in its chunk)
public/
  models/       # draco-compressed .glb
  photos/       # WebP, max 1600px long edge, lazy-loaded
```

## Art direction

**Vibe:** warm low-poly island at golden hour. Flat-shaded materials, gentle fog, gradient sky. The island itself is the signature — the overlay UI stays quiet and disciplined so the world does the talking.

**Palette (named tokens, use everywhere):**
- `sand` #E8D5A3 · `palm` #55A05F · `lagoon` #35A7A0 · `deepwater` #1D6E73
- `sunset` #FFB870 (sky horizon, in-world light accents only)
- `ink` #14262B (UI text / panels), UI accent = `lagoon` (not orange — keep the sunset in the world, not the chrome)

**Overlay typography:** display = Bricolage Grotesque (headers, HUD labels, 1–2 weights max); body = Atkinson Hyperlegible with system-ui fallback. No other font families.

**Signature moment:** on load, the camera starts high above the island and swoops down to settle behind the avatar at the spawn beach. One orchestrated intro; no other gratuitous animation. Respect `prefers-reduced-motion` — skip the swoop, fade in instead.

## World design — the island

Roughly 80×80 m, walkable end to end in ~30 seconds. Layout:

- **Spawn:** beach with a campfire and log bench. Ukulele leans against the log → MUSIC.
- **Wooden dock** into the lagoon. Camera on a tripod at the end, facing the sunset → PHOTOGRAPHY. Mailbox at the dock entrance → CONTACT.
- **Palapa / lean-to** with a desk and glowing monitor → PROJECTS.
- **Grassy rise** with one big tree; gymnastics rings hang from a branch → ABOUT/MOVEMENT (short card).
- **Old CRT TV on a crate** near the rocks, absurdly running on island power → YOUTUBE.
- Scatter props: palms, rocks, shells, grass tufts (instanced), a beached rowboat.
- Water: large plane with a cheap animated material. Falling in teleports the player back to spawn — no fail state.

**Wayfinding:** a small bobbing icon floats above each interactable. First-visit HUD hint: "WASD / drag to move — walk up to things and press E." Hint disappears after `hasMoved`.

## Interaction system

- Each interactable registers a rapier sensor (radius ≈ 2.5 m). Player enters → `nearbyId` set → HUD shows `[E] {label}` (mobile: a tap button).
- Press E / tap the button / click-tap the object mesh directly (R3F pointer events) → `openModalId` set → overlay opens.
- Esc or close button returns to the world. Focus is trapped inside open modals; visible keyboard focus states everywhere.

## Content model

`interactables.ts` entry shape:
`{ id, label, prompt, modelPath, position, rotation, modal: 'gallery' | 'projects' | 'music' | 'videos' | 'contact' | 'card', contentKey }`

Content files (the only files edited for routine updates):
- `photos.ts` — `[{ src, alt, caption?, location? }]`
- `projects.ts` — `[{ title, blurb, tech: string[], link?, repo? }]`
- `music.ts` — `[{ title, embedUrl? , audioSrc? }]`
- `videos.ts` — `[{ title, youtubeId }]` — render thumbnail first, inject the iframe only on click (lite-embed pattern)
- `contact.ts` — `{ email, links: [{ label, url }] }`
- `about.ts` — short bio card copy for the rings

Modals: gallery = responsive grid + lightbox with arrow-key nav and lazy images; projects = simple cards; videos = lite-embeds; contact = mailto + links. Plain verbs on buttons ("Close", "Next photo"), sentence case, no filler copy.

## /classic fallback (SEO + accessibility)

- Route `/classic` renders the same content files as a normal one-page portfolio. Its chunk must not import three.js.
- Link to it from the loading screen and the HUD menu ("View classic site").
- If WebGL is unavailable, redirect to `/classic` automatically.
- Meta + Open Graph tags (title, description, preview image) live on both routes.

## Assets

- **Character:** Quaternius animated low-poly character (CC0, ships with idle/walk/run/jump) — first choice. Mixamo retarget is the fallback.
- **Props/nature:** Kenney kits, Poly Pizza, Quaternius. Prefer CC0; keep a `CREDITS.md` regardless.
- **Compress every model:** `npx gltf-transform optimize in.glb out.glb --compress draco`.
- Budgets: all models combined < 4 MB; photos are lazy-loaded and never part of the initial payload.

## Performance

- Clamp DPR to [1, 2]; use drei `PerformanceMonitor` to drop DPR/effects on weak devices (`qualityTier`).
- Instance repeated props (palms, rocks, grass).
- One directional light + ambient. No shadow maps on the mobile tier; cheap blob/contact shadows under the player and key props only.
- Suspense everywhere; loading screen driven by `useProgress` (island silhouette + percentage).
- Sound (phase 3): looping wave ambience + a soft interact blip, muted until first user gesture, mute toggle in HUD.

## Phases and acceptance criteria

**Phase 1 — Walkable gray box (ship day one)**
Vite app deployed to Vercel. Flat ground plane, ecctrl capsule player, third-person camera, one placeholder box with proximity prompt that opens a dummy modal. Loading screen works. Playable on a phone with the joystick.
✓ Done when: a live URL where you can run around and open one modal on desktop and phone.

**Phase 2 — Island blockout + all interactions**
Island terrain blocked out with primitives. All six interactables placed from data, all modal types working with placeholder content. `/classic` route live and code-split.
✓ Done when: every object opens its modal; classic page renders the same content.

**Phase 3 — Art and feel**
Real glTF props and animated character, lighting/sky/fog/palette per art direction, camera-swoop intro, wayfinding icons, sound + mute, contact shadows, perf pass on a real phone.
✓ Done when: 60 fps desktop / ~30 fps mid phone, < 8 MB initial payload.

**Phase 4 — Content and launch**
Real photos, projects, music, videos, contact. Meta/OG tags, favicon, custom domain, lightweight analytics, `CREDITS.md`.
✓ Done when: the shared link previews nicely and everything on the island is real.

## Working conventions

- Small components; scene components only reach content through the interactables map.
- TypeScript strict, no `any`.
- Commit per working feature; `main` stays deployable.
- Ask before adding dependencies or changing art direction.
- After any control or UI change, test in a mobile viewport before calling it done.
