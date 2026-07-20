# CLAUDE.md — 3D Planet Portfolio (v3)

## What this is

A personal portfolio website that plays like a small game: a tiny low-poly planet frozen at dusk. The visitor's avatar stands at the top of the sphere and never moves — running rotates the whole planet underneath them (the Mario Galaxy illusion). The island has two permanent moods: a **sunset side** (longitude 0°: sun low over the water, seagulls, the dock, a ukulele player) and a **night side** (longitude 180°: moon, stars, a campfire on the beach, a glowing CRT). Portfolio content lives inside interactable objects. Built as a static web app, deployed to Vercel.

Owner: Aiden — data analyst / developer (Python, SQL, ETL, Flask, some React).

### Status
- ✅ **Phase 1** — walkable gray box (flat world, since removed).
- ✅ **Phase 2** — planet core: quaternion controller with analytic ground (`groundHeightAt`), pointer-lock + orbit + touch controls, six data-driven interactables, all modal types, `/classic` fallback, 24 vitest cases. 9 commits on `main`; smoke suites exist only in session scratchpads (fix in 3A).
- ✅ **Style reset (v3.1)** — imported kit assets removed; chunky-faceted primitives + BlockyCharacter per `docs/style-playbook.md`; Lambert lighting rig; per-face terrain colors; draw-call budget adopted.
- ✅ **Phase 3B** — two skies: planet-local CelestialDome (sun/moon/stars), `useSkyState` nightMix crossfade, box-cluster clouds, seagulls, shooting stars, CRT night glow, intro swoop over the terminator. Verified: smooth 0→180 crossfade, budgets hold (≤46 draw calls), suites green (`e2e/crossfade.mjs` documents the walk).
- ▶ **Now**: 3B refinement v3.2 (night-is-night dome shader, 3-stop sky, look-up camera; continuous terrain profile) → Phase 3C.

### Goals, in priority order
1. Memorable within 10 seconds; calm, cozy, Animal-Crossing-adjacent vibe. The rotating planet and its split sky are the signature.
2. Fast: < 8 MB initial payload; 60 fps desktop, ~30 fps on a mid-tier phone.
3. Content updates never touch scene code (`src/content/` only).
4. Always deployable: every sub-phase ends with a working build.

## Tech stack (locked — do not swap without asking)

Vite · React 19 · TypeScript strict · three.js via `@react-three/fiber` · `@react-three/drei` · `zustand` · Tailwind (overlays only) · vitest · GitHub → Vercel.
Audio: three.js `AudioListener` / `PositionalAudio` / `Audio` (no Howler, no Tone unless asked). Water waves: one small custom `ShaderMaterial` or `onBeforeCompile` — no postprocessing stack. No physics engine. Ask before any new dependency.

## Planet mechanics (unchanged core + retunes)

Core is done and stays: avatar kinematic at the pole, input rotates the planet quaternion, angular-distance triggers with hysteresis, island clamp, blockers with slide-along, analytic `groundHeightAt`. Changes:

- **Speed** (retuned in 3A.1): walk **6.5**, **sprint 10** on Shift (`run` in the keyboard map; joystick full-deflection ≥ 0.95 sprints). Crossing the island ≈ 22 s walk / 14 s sprint.
- **Proportions**: `GRASS_POLAR_DEG` **66**, island edge 75°, **`PLANET_RADIUS` 55** (3A.1 medium-world retune — placements are lat/long + meter radii, so they survive radius changes). Sand is a ~9 m ring (lat 15–24).
- **Wading** stays: clamp ~2.5 m past the beach line; add a ripple ring + soft splash SFX on crossing the waterline. No swimming (a treasure ship is backlog).

### Placement rules (fixes the floating/sunken props and the dock)
1. **Never hardcode altitude.** Export `groundAltitudeAt(lat, long)` next to `groundHeightAt` (same analytic bands: grass / sand / dock / water) and derive every SurfaceGroup altitude from it, minus a **0.1 m sink** so bases bite into the ground. Applies to props, interactables, NPCs, critters. This is the root cause of trees floating at the horizon and sinking up close.
2. **No straight mesh longer than ~4 m lying on the sphere.** A chord floats mid-span and buries its ends. Long objects (dock, bench, boat) are built from short surface-snapped segments (or a curved strip).
3. **Meridian alignment**: `surfaceQuaternion` gives an arbitrary twist; derive yaw from local north/east tangent vectors (add a `meridianYaw(lat, long)` helper) so the dock runs along its meridian toward the water, not parallel to the shore.
4. **One continuous terrain surface (v3.2).** Grass, sand, and the underwater apron are ONE sphere-cap mesh whose radius follows `terrainProfile(polar)` in planetConfig: grass plateau → eased shoulder → beach ramp reaching sea level exactly at the waterline → shallow underwater apron continuing ~6° further, ending tucked under the ocean-floor sphere. **Never an exposed rim, never a visible underside, no stacked shells.** `groundHeightAt`/`groundAltitudeAt` evaluate the SAME profile (plus the dock strip) so feet, prop placement, and visuals can never disagree. Wading depth comes from walking down the real slope — there is no step at the waterline.

### The dock (rebuild)
Longitude 0, lat 24 → 13: entrance on sand, last two segments over open water. 4–5 plank segments (each ≤ 3 m) with posts, each snapped to the surface per the rules above; deck top ≈ 0.6 m above local ground. Keep `DOCK` in `planetConfig` as the single source of truth consumed by both the visuals and `groundHeightAt` — they must never disagree. The Photos tripod stands ON the dock's far end; the mailbox at the entrance.

## The two skies (new — biggest 3B item)

The sun, moon, stars, and sky gradient are **children of the rotating planet group** (planet-local). That is what makes the sides permanent: walk toward long 0° and the sun rises ahead of you; walk to 180° and the moon comes up.

- **`<CelestialDome>`** inside `planetRef`: an inverted sphere, radius ≈ 240 (inside camera far 400), with one small dome `ShaderMaterial` (allowed alongside the water shader; still no postprocessing). **Set `fog: false` and `depthWrite: false` on the dome, sun, moon, and stars materials** — otherwise scene fog (60–220) fogs the dome invisible. Render the dome first.
- **Sky model (v3.5 — DIRECTIONAL, banding dead)**: the banded-quantization experiment failed and is deleted — the whole gradient is computed per-fragment with smooth easing, plus a subtle screen-space hash dither (~±1/255) because shallow gradients band on 8-bit displays even with smooth math. **Acceptance: zero visible stepping in 360° pans at deep day, both terminators, and deep night, at 100% zoom.** Three layers:
  - **Base (elevation-only blues, v3.8 — no pale bottom)** — day: zenith `#4C8BD8` easing to a REAL sky blue `#8FC2EC` at the horizon (`#B7D0EE` retired: it read white-with-a-hint); night keeps the blue→black 4-stop ramp (`#24304F → #1A2340 → #10182E → #070A14`). The shader minimum-saturation clamp and the skycheck pixel thresholds are raised to match, so a pale band can never regress back in. The anti-sun day horizon carries a slightly deeper soft blue haze (evening air).
  - **Blend hazard rule**: warm sunset colors mixed into blue in plain RGB pass through gray — the sunset→blue transition routes through a saturated soft pink/peach bridge tone.
  - **White-out root cause + enforcement (v3.7)**: the diagnosed bleacher was the ACES tone mapper — the layer math was already saturated, but `tonemapping_fragment` compressed the gold/pale regions toward white. The sky renders UNMAPPED: the dome shader skips tone mapping and every sky mesh material (discs, glows, stars) sets `toneMapped: false` — sky tokens are WYSIWYG. Additionally enforced: day fog + clear color light blue `#A8C6E8` (never cream), and a shader-level minimum-saturation clamp mixes any bright-gray sky fragment toward the palette blue. **Acceptance with teeth**: `e2e/skycheck.mjs` samples pixels — at deep day across sun-facing/side/anti-sun pans, no sky pixel outside the disc/halo core may be near-white (low saturation at high lightness); the check fails the sweep.
  - **Sunset layer** — warm contribution as a function of BOTH angular distance from the sun's azimuth AND elevation: deep orange `#FF7A33` piled at the horizon around the sun with a gold `#FFC861` heart, easing through pink `#E893B8` outward and upward, fully faded by ~90° away (the anti-sun sky stays blue evening). Gated by nightMix. Fog rides its own warm-cream token `#F0BA94`.
  - **Moon layer** — same shape, subtle silver-blue `#AEBCD8`, night-gated.
  - Feel check (verified): from the day beach, facing the sun = full sunset; turn around = calm blue evening; the sky visibly shifts as you pan and walk. Finals recorded here and in `SKY` (useSkyState).
- **Sun presentation**: brighter near-white core with a two-stage glow — tight warm inner + wide soft outer.
- **Living clouds (v3.5 — replaces the static clusters)**: a pooled system of 6–10 primitive clusters (3–6 rounded flat-shaded boxes each, style bible), planet-local at ~25 m altitude. Lifecycle: fade+scale in over ~3 s, drift along a great circle on one global wind (~0.5–1 m/s), live 60–120 s, fade out, respawn elsewhere; `transparent` + `depthWrite:false` so fades never sort-glitch. Per-frame tint: warm underlit near the sun's azimuth → cool dark night-side (lerp by angular distance + nightMix). Never spawn or drift within ~18° of either disc; stay above ~20° elevation; sparse. Budget ≤ 8 extra draw calls.
- **Sun halo**: additive warm glow in the horizon band only — within ~±40° of the sun's azimuth, faded out by ~25° elevation — and gated by night: `halo *= 1 − smoothstep(0.45, 0.85, nightMix)`. **Zero warm light anywhere when nightMix > 0.85.**
- **Deep-night wayfinding**: a faint steel-blue horizon band (`#31456B`, subtle) toward the **day azimuth only**, fading in past nightMix ~0.8 — the "home is that way" cue that replaces any orange bleed.
- **Celestial arc (v3.8 — rise → high → TRUE SET)**: disc elevation is a smooth function of the player's polar angle from island center — `CELESTIAL_ELEVATION_INLAND_DEG` (~45°) on the plateau, easing down across the beach band to a waterline endpoint where the disc is **~40% submerged below the sea horizon** (60% visible; elevations are horizontal-relative, sea horizon ≈ −16.6°, so the endpoint sits near −15.8°). The ocean geometry occludes the dome, so the cutoff is physical — no masking. Wading past the waterline sinks it slightly further, clamped at ~55% submerged so it never vanishes. ~0.6 s exponential smoothing; azimuths stay home (0 / 180); the solved disc latitude stays clamped to its home side so world rotation composes: walking 180 → 0 the moon sets into the sea behind you, the sun crests ahead, climbs high across the plateau, and descends into a true set at the shoreline. The radial glow reads as a half-dome sitting on the sea line; the glitter path connects viewer to the half-set disc. Both bodies share the rule.
- **Body-centered glows (v3.7)**: the warm layer is a RADIAL function of angular distance from `uSunDirWorld` — the disc sits centered in its glow at every elevation, strongest at the disc, tinted warm at every radius (never near-white outside the disc), faded by ~40°. A horizon-hugging warm band appears ONLY when the sun is low (elevation < ~18°) — a high sun never has an orphaned glow band below it. Moon: same radial structure, cool silver-blue, tighter (~25°), night-gated — no giant dome-wash. Both key off the shared dynamic dirs, so glows (and the water glitter, which reads the same locals) ride the arc automatically.
- **Emissives scale with nightMix**: campfire flame and the CRT screen glow ramp up at night.
- **`useSkyState` hook** (one place, per frame): compute `nightMix` from the pole's sunward projection (0 sunset side → 1 night side; see the hook for why not raw meridian distance). Drive: dome shader uniforms (nightMix, sun/moon world dirs), fog + background = current horizon stop, directional light color `#ffd9a0 → #9fb4ff` and intensity down at night, hemisphere pair + ambient down slightly. Directional light direction follows the sun's (moon's past the 0.4–0.6 handover) current **world** position derived from the planet quaternion.
- **Camera look-up**: pitch extends below horizontal; as pitch goes negative the camera drops low behind the avatar and the lookAt target lifts, so the sky/zenith fills the frame with the avatar silhouetted at the bottom. The camera is floored ~0.4 m above the analytic ground (radial clamp) so it never clips terrain. Same range on touch drag; keep the comfort smoothing.
- **Clouds** (playbook §4 recipe — binding): hand-built clusters of 3–6 white rounded boxes per cloud group (Aviator pattern), instanced when numerous, slow planet-local drift in `useFrame`. Never drei `<Cloud>`/`<Clouds>` (billboard sprites needing a cloud texture). Warm-tinted and plentiful on the sunset side, sparse on the night side.
- **Lighting** (playbook §4 recipe — base rig ships before 3B): `HemisphereLight(skyPastel, groundPastel)` + one soft `DirectionalLight` + gentle ambient, `MeshLambertMaterial` everywhere. Cozy brightness comes from light intensity and saturated-but-light palette colors — never bloom/postprocessing. 3B's `useSkyState` lerps this same rig (hemisphere sky/ground colors, directional color/intensity) with `nightMix`.

## World map (single source of truth — matches the approved top-down map)

| What | Kind | lat | long | Notes |
|---|---|---|---|---|
| Spawn | — | 90 | — | Initial camera azimuth faces long 0 (first sight: sun over water + dock) |
| Dock | prop | 24→13 | 0 | Segmented; walkable deck (analytic strip) |
| Camera tripod | Photos | 14 | 0 | On the dock end, over water, facing the sun |
| Mailbox | Contact | 24 | 6 | Dock entrance |
| Ukulele player | NPC | 18 | 357.5 | Seated on the dock edge, legs over water |
| Seagulls ×2–3 | critter | — | ~0 | Tilted orbit loops over sunset-side water |
| Palapa + desk | Projects | 40 | 40 | Day-leaning side |
| Big tree + rings | About | 50 | 300 | Dusk boundary west |
| Campfire + log bench | prop | 22 | 180 | Night beach; flicker light + crackle |
| Ukulele on the log | Music | 22 | 173 | Aiden's music portal, by the fire |
| CRT TV on crate | Videos | 21 | 150 | Screen glow reads at night |
| Rowboat | prop | 18 | 210 | Beached |
| Crabs ×3–4 | critter | 16–23 | any | Wander the sand ring, both sides |
| Scatter palms/rocks/shells | props | per taste | — | Re-scatter for the new bands; altitudes from rule 1 |

Blockers regenerate from this table. Interactable prompts/copy unchanged.

## Art direction — the style bible

Visual targets: **Animal Crossing** (cozy ground + props), **Wii Sports Resort / Miis** (characters), **Minecraft** (chunky facets). `docs/style-playbook.md` is the **technique authority** — its recipes are binding; do not re-derive alternatives.

- **Characters speak AC/Mii**: rounded chibi ~2.2 heads tall, oversized rounded head, stubby limbs, **no fingers**, big flat eyes. Matte-plastic finish (the Mii look). Built from primitives with pivot-group limbs (playbook §1), animated procedurally (playbook §2) — no skeletons, no clips.
- **The world speaks chunky-faceted**: visible flat facets and blocky silhouettes — the facet read comes from Minecraft, **not** textured cubes. Every prop is a hand-built primitive assembly with chunky proportions.
- **Color**: bright soft pastels; cozy, clean, slightly-overexposed cheerful. Existing tokens `sand/palm/lagoon/deepwater/sunset/ink` plus night tokens: `midnight` #1B2033, `moonlight` #9FB4FF, `starlight` #FFF3D6, `ember` #FF8C42.
- **One material language**: flat palette colors per mesh; per-face vertex colors for terrain patches; **`MeshLambertMaterial` is the default everywhere** (approved experiment: `MeshToonMaterial` with a procedural 3-step gradient `DataTexture`). No Phong/Standard/Physical, no specular, no PBR. **Image textures are banned** — procedurally *generated* canvas tiles are allowed only per the playbook §3 flat-patch caveat.
- Flat-shaded, no shadow maps, blob shadows only. Typography unchanged (Bricolage Grotesque + Atkinson Hyperlegible). Signature moment: the intro camera starts in space **over the terminator** (both sides visible), then swoops to the pole; respect `prefers-reduced-motion` (fade instead).

### Ground & water feel
- **Terrain**: ONE continuous cap mesh following `terrainProfile` (placement rule 4), painted with **per-face two-tone vertex colors** (playbook §3) by polar band: grass greens on the plateau, a blended grass/sand transition across the ramp shoulder, sand tans down to the waterline, darker wet-sand tint on the submerged apron. Seeded deterministic jitter stays, but scales down near band transitions (it must never expose an edge) and keeps the pole fade. No image textures.
- **Surf & foam (v3.3 — no separate ring mesh)**: the water shader computes depth against `terrainProfile` per vertex and paints a white foam band where the LIVE wave-displaced surface meets the beach (depth < ~0.35 m) with a noise-broken leading edge — computed from the displaced surface, it can never detach or gap. A slow surf cycle (~5 s period, gentle amplitude, shore-weighted) advances and recedes the waterline up the sand with foam riding the leading edge. `surfOffset` in planetConfig is the single source for the shader AND the controller, so the wade ripple keys off the same live waterline.
- **Glitter paths (v3.6 — true specular)**: the glitter is VIEW-DEPENDENT, computed per-fragment — never a band anchored at a fixed azimuth. The water normal is perturbed analytically from the same sine sum that displaces the vertices (plus normal-only micro-ripples for glint breakup), then a Blinn term per light (`H = normalize(viewDir + lightDir)`, `pow(dot(N,H), power)`) using the sky's sun/moon world dirs: warm day-gated sun glints, pale-cool night-gated moon glints, tuned to a long broken lane of small soft glints with the shore/distance fades kept. Walking the beach, the path travels WITH you toward the light; orbiting swings it. **This is a deliberate specular exception to the matte style rule — water only.**
- **Waves**: vertex displacement on the water sphere — 2–3 summed sines, amplitude ≈ 0.12 m, planet-local (waves rotate with the world). Cheap; no reflections/refraction.

## Ambient life (all code-animated primitives — no skinned glTFs for critters)
- **Ukulele player** (sunset dock): low-poly seated figure, procedural strum/bob; `PositionalAudio` loop (refDistance 4, exponential rolloff); spawns rising **♪ note sprites** (textured quads, planet-local, drift + fade, pooled).
- **Crabs**: body + leg boxes, sideways scuttle; random-walk within the sand ring (lat 16–23), pause often, skitter a step away when the player is within ~2 m.
- **Seagulls**: two-plane flap on tilted orbits above sunset water; occasional quiet cry.
- **Campfire**: cone flame with emissive flicker (sin-noise), small flickering point light (night side), 2–3 rising smoke puffs; crackle `PositionalAudio`.

## Audio system (new)
- `AudioListener` on the camera. All audio starts only after the first user gesture; global mute in the HUD (store).
- **Buses**: `music` (lo-fi loop), `world` (positional: ukulele, campfire, waves, splash), `ui` (blip).
- **Lo-fi loop**: the default ambience — chill, Minecraft-menu energy. Must be royalty-free/CC with attribution in `CREDITS.md` (never a copyrighted track), ogg ≤ 2 MB, lazy-loaded after first gesture, seamless loop, volume ~0.35.
- **Crossfade rule** (per frame, ~0.5 s lerp): `musicGain = base × smoothstep(8 m, 20 m, arcTo(ukulele player))` — inside 8 m the ukulele owns the soundscape, beyond 20 m the lo-fi is back. Same pattern for the campfire with tighter radii (4 m / 10 m, partial duck to 0.6).
- Opening a media modal (Videos/Music) ducks music to 0.2; restore on close.
- **Waves ambience**: quiet loop whose gain rises near the waterline.

## Player avatar (BlockyCharacter)
The avatar is **Aiden** as a `BlockyCharacter`: a parameterized chibi rig (playbook §1) built entirely from primitives — rounded-box body, oversized rounded head, big flat eyes, pivot-group limbs, no fingers — configured from `src/content/characters.ts` (Aiden: blonde swoop hair, thin dark glasses, yellow tee, teal shorts). Animation is procedural transform math on the pivot groups (playbook §2): idle bob, counter-phase walk, run with forward lean, jump squash-and-stretch (launch immediately, never delay input) — one blend parameter per state, ~0.15 s lerped-parameter crossfades wired to `controlsRuntime.locomotion` / `airborne`. No glTF, no skeleton, no `AnimationMixer`. ≤ ~3k tris. Blob shadow stays.

**Head look-at (v3.4 — two targets, blended handoff)**: when idle and the camera is in the frontal cone (~±70° of body forward), the head eases (~0.2 s exponential) toward the CAMERA — eye contact — clamped ±60° yaw / ±25° pitch. Camera behind/beside: the head eases toward the camera's AIM POINT (camera position + forward × ~12 m) so the character glances where the player is looking, same clamps, neutral beyond them. Blend between the two modes by camera angular position — no snapping at the cone edge. Moving keeps body-facing priority with the subtle ~10° glance. Gentle idle head sway; blink skipped by design (eyes merged into the head node). Future NPCs share all of it.

**Blob shadow (v3.4 — grounded)**: shoe soles sit exactly at rig-local y=0 and the avatar plants at `groundHeightAt`. The shadow lives OUTSIDE the jump-animated group: it receives ground height only (never jumpOffset), sits at ground + a small epsilon with a polygon-offset depth trick against the jittered facets, and during a jump stays on the ground shrinking to ~60% / fading to ~50% opacity at apex, recovering on landing. Same rules for future NPCs via the shared rig.

## Unchanged systems
Interaction flow, content model, modals, `/classic` (add night-token styling only if trivial), meta/OG in Phase 4.

## Asset pipeline (v3 style reset: hand-built primitives only)

The CC0-pack experiment is reversed — imported glTF props and the imported avatar are **out** (removed along with the Draco decoder and model files). Every prop, character, and critter is hand-built from three.js primitives per the style bible; no model files, no loaders, no compression step.

- **Construction**: primitive assemblies (boxes/rounded boxes, cylinders, cones, icosahedra) in chunky-faceted proportions. Palms: stacked banana-curve box trunk + flat wedge fronds. One shared material per color per prop type.
- **Instancing**: repeated props (palms, rocks, shells, dock planks/posts) render as instanced meshes; static same-material clusters may use `mergeGeometries` (playbook §5).
- **Placement unchanged**: the world map table + `groundAltitudeAt` − sink drive every placement; blocker radii match the primitive footprints.
- **Critters**: always code-animated primitives per Ambient life — never skinned glTFs.

## Performance budgets (3A.1 + style-reset draw-call budget)
- **Draw calls** (the primary budget — playbook §5): **< 50 on mobile, < 100 on desktop**, measured via `renderer.info.render.calls` (`e2e/measure.mjs` and r3f-perf both report it). When over budget, **fix draw calls first**, then segment counts, then effects — triangles are almost never the bottleneck.
- **Triangles**: island caps + water + ocean floor ≤ **60k**; whole scene ≤ **150k**.
- **Frame loop**: zero allocations and zero geometry rebuilds inside `useFrame` — scratch vectors/quaternions only; terrain jitter/tint is baked once at startup. Water waves run in the vertex shader (`onBeforeCompile`), never on the CPU.
- **Repeats are instanced**: palms, rocks, shells, dock planks/posts, campfire stones — one draw call per kind.
- **Degradation**: DPR clamped [1, 2]; drei `PerformanceMonitor` drops `qualityTier` to `low` on sustained decline (DPR → 1; two flip-flops lock low). 3B/3C gate stars/note-sprites/critter counts on the tier.
- **Profiling**: `?perf` mounts a lazy r3f-perf overlay (dev-only dependency, code-split); `node e2e/measure.mjs [--dsf 2] [--throttle N]` records fps / draw calls / triangles at spawn, mid-dock, and the night beach against the preview build.

## Phases

**Phase 3A — Ground truth (fixes + feel)**
Speed + sprint + run key; new proportions; `groundAltitudeAt` + sink rule applied to every placement; `meridianYaw`; dock rebuilt per spec; world re-laid-out from the map table (blockers regenerated); cap vertex jitter + vertex colors; water waves + foam ring + wade splash/ripple; **adopt the Playwright smoke suites into `e2e/` in-repo** (playwright as devDependency, npm script) so verification survives sessions.
✓ Done when: no prop floats at the horizon or sinks up close (screenshot sweep around the island), the dock visibly runs from sand out over the water and is walkable end to end, beach reads as a beach, sprint feels good on desktop and phone, unit + e2e suites pass.

**Phase 3B — Two skies**
CelestialDome + sun/moon/stars (fog-excluded), `useSkyState` fog/light/clear-color lerp driving the hemisphere + directional rig, box-cluster clouds (per the recipe above) with side tinting, campfire + bench + music ukulele on the night beach per map, TV glow at night, seagulls on the sunset side, shooting stars — occasional meteor streak, night side — and the intro swoop over the terminator.
✓ Done when: walking long 0 → 180 crossfades the whole mood with no popping, both sides screenshot beautifully, 60 fps desktop / ~30 mid phone holds.

**Phase 3C — Life & sound**
Ukulele NPC + note sprites + positional loop (avatar + run animation shipped with the style reset); audio buses + lo-fi loop + crossfade/duck rules; crabs; campfire crackle + flicker; waves ambience; mute toggle polish.
✓ Done when: the lo-fi ⇄ ukulele crossfade works by ear walking the dock, crabs scuttle without entering the water or the grass, audio only ever starts after a gesture, budgets hold (audio lazy-loaded).

**Phase 4 — Content & launch** (unchanged)
Real photos/projects/music/videos/contact, meta/OG, favicon, domain, analytics, `CREDITS.md` (now includes audio).

**Backlog (do not build yet)**
Roaming NPCs of family & friends — Animal-Crossing-style wander/waypoints + optional recorded voice notes with captions; ship only with each person's explicit okay (public site). Treasure ship offshore with secrets. Footprints in sand. Fireflies on the night side. Day/night slider.

## Working conventions
Unchanged (strict TS, no `any`; content only via content files; commit per working feature; `main` deployable; ask before deps or art-direction changes; test mobile viewport after control/UI changes) plus: quaternion/sky/audio math stays in hooks under `controls/` or `scene/` with comments; new analytic bands get vitest cases; e2e suites live in `e2e/` from 3A onward.

## Model routing (cost tiers — agents in `.claude/agents/`)

- **worker** (Sonnet): delegate routine, fully specified implementation — map-table placements, content files, new tests, constant retunes. It escalates design questions instead of deciding them.
- **verifier** (Haiku, low effort, read-only + Bash): ALL review/verification fan-outs — verifying a single finding, running a suite and reporting pass/fail. Never run these on the session model.
- **Explore** (Haiku): codebase exploration always routes here, never on an expensive model.
- **fable-advisor** (Fable, few turns): consult before guessing whenever a decision isn't covered by this file or the session is genuinely stuck; it returns a decision + rationale, no code.
- The main session model is reserved for planning, novel systems (controller/sky/audio math), integration, and final review.
