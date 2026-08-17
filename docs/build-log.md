# Build log — how the island works

This file is the CONTENT SOURCE for the in-game Matrix room (glitch
portal, planned at lat 32 / long 97): each chapter becomes a wall
panel. Write for visitors first, developers second. The format is
strict so `scripts/export-build-log.mjs` can parse it into
`docs/build-log.json` — every chapter needs `{#id}` on its heading and
the five labeled sections, and `Files:` lines must be real repo paths
with real symbol names (the room shows actual code excerpts, not prose
about code). Run the export after editing; it fails loudly on
malformed chapters.

## 01 · The world that turns beneath you {#fixed-pole}

**Hook:** You never actually move — the whole planet rotates under your feet.

**Plain:** The character stands frozen at the top of the globe, and
walking spins the entire world the other way, like log-rolling. It's
the same trick Mario Galaxy uses. Doing it this way means the camera
and character never wander off anywhere numerically messy — the world
comes to you.

**Technical:** Input builds a rotation quaternion each frame:
`rotationStep` turns a camera-relative move direction into a small
world rotation about a horizontal axis (negative angle — the ground
must flow backward under the avatar), and `applyStep` premultiplies it
onto the planet group's quaternion. Everything that needs to know
"where am I standing" pulls the world pole back through the inverse
rotation (`poleInPlanetSpace`) to get a planet-local direction, which
maps to lat/long. Blockers, interactable triggers, and the island-edge
clamp are all angular-distance tests against that direction —
distance in meters is just angle × radius.

**Files:**
- `src/controls/planetMath.ts` — `rotationStep`, `applyStep`, `poleInPlanetSpace`, `latLongToUnit`
- `src/controls/usePlanetController.ts` — `controlsRuntime`, the frame loop, blocker slide-along

**Decisions:**
- A moving avatar on a static planet was rejected up front: the camera
  rig, gravity alignment, and floating-point behavior all get worse as
  you leave the origin. The fixed pole keeps every hot computation in
  a numerically tiny neighborhood.
- Slide-along blockers decompose a blocked diagonal step into its
  camera axes and retry each — walking into a wall at an angle glides
  instead of freezing.
- Sitting (the campfire logs) is a quaternion TWEEN to put the seat
  under the pole, deliberately not a step, so blockers can't interfere
  mid-sit.

## 02 · Ground you can trust without physics {#analytic-ground}

**Hook:** There is no physics engine — the island's shape is a formula.

**Plain:** Instead of simulating collisions, the ground height at any
point is computed from a single mathematical profile: grass plateau,
beach ramp, underwater slope. Feet, props, and the water all ask the
same formula, so nothing can ever float or sink by accident — and it
costs almost nothing to run.

**Technical:** `terrainProfile(polar)` defines altitude as chained
smoothsteps over the angle from the pole; `groundAltitudeAt(lat, long)`
adds the dock's walkable strip (`onDockStrip` tests cross-track meters
against the dock meridian) and `groundHeightAt` turns the avatar's
planet-local direction into a world height every frame, allocation-free.
Placement rule 1 derives every prop's altitude from the same function
minus a 0.1 m sink; the terrain MESH is displaced by the same profile,
so visuals and walkable height are one source of truth.

**Files:**
- `src/scene/planetConfig.ts` — `terrainProfile`, `TERRAIN`, `DOCK`, `surfaceUnderfoot`
- `src/controls/terrain.ts` — `groundAltitudeAt`, `groundHeightAt`, `onDockStrip`
- `src/scene/SurfaceGroup.tsx` — placement on the analytic ground

**Decisions:**
- A physics engine was rejected in the spec: determinism, bundle size,
  and the fact that a sphere-cap island needs exactly one height query.
- Raycasting the terrain mesh was rejected too — it's slower and lets
  feet disagree with the math when jitter/tint bakes touch the mesh.
- The hard-won corollary (Koa's floating seat): anything ON a built
  structure derives altitude from THAT structure's strip, never the
  terrain band under the overhang.

## 03 · One continuous terrain surface {#one-terrain}

**Hook:** The beach isn't a second object lying on the island — it's the same skin.

**Plain:** Grass, sand, and the underwater slope are one continuous
mesh whose radius follows the ground formula, painted by latitude
bands. Early versions stacked separate shells for grass and sand, and
the seams showed at exactly the places players stare at — the
waterline. One surface means there is no seam to show.

**Technical:** A sphere-cap geometry runs from the pole past the
waterline to an apron that tucks under the opaque ocean-floor sphere;
`facetTerrain` displaces each vertex by `terrainProfile`, splits
faces for the flat-shaded look, and paints per-face two-tone vertex
colors by polar band with seeded jitter that fades near band
transitions. Wading depth is just walking down the real slope — the
controller and the mesh share the profile, so there is no step at the
waterline.

**Files:**
- `src/scene/Island.tsx` — the cap build, band painting
- `src/scene/geometryUtils.ts` — `facetTerrain`, `bakeWarmTintToward`
- `src/scene/planetConfig.ts` — `terrainProfile`, `TERRAIN.apronEndDeg`

**Decisions:**
- Three stacked shells (grass cap, sand ring, underwater apron) were
  rejected after shipping briefly: exposed rims and visible undersides
  at grazing angles, and feet/visual disagreements at seams.
- A separate painted foam ring mesh was rejected with them — foam now
  comes from the water shader comparing its LIVE displaced surface
  against the same terrain profile, so it can never detach or gap.

## 04 · Two skies on one planet {#two-skies}

**Hook:** Walk one way and the sun rises; walk the other and you get the moon — permanently.

**Plain:** The sun, moon, stars, and sky colors are children of the
rotating planet, not the fixed camera. That single choice is what
makes the island's two moods permanent places instead of a day/night
timer: sunset lives on one side of the world, night on the other, and
walking between them crossfades everything.

**Technical:** `useSkyState` computes `nightMix` from the pole's
sunward projection each frame and drives one dome `ShaderMaterial`
(elevation-based blues, a sunset layer shaped by angular distance from
the sun's azimuth, a silver moon layer), the fog and clear color, and
the hemisphere/directional light rig. Sky materials set `fog: false`,
`depthWrite: false`, and — critically — `toneMapped: false`: the sky
renders unmapped so its palette tokens are WYSIWYG.

**Files:**
- `src/scene/useSkyState.ts` — `nightMix`, `skyRuntime`, the per-frame lerp rig
- `src/scene/CelestialDome.tsx` — the dome shader, discs, stars
- `src/scene/SkyRig.tsx` — lights driven by the sky state

**Decisions:**
- A banded, quantized sky gradient was tried and DELETED: shallow
  gradients band on 8-bit displays, and quantizing made it worse. The
  replacement is per-fragment smooth math plus a ~±1/255 hash dither.
- The great white-out hunt: the ACES tone mapper was silently
  compressing saturated sky golds toward white. The fix wasn't more
  saturation — it was exempting the whole sky from tone mapping.
- Warm sunset colors mixed into blue in plain RGB pass through gray —
  the transition routes through a saturated pink/peach bridge tone
  instead.

## 05 · The sun actually sets {#celestial-arc}

**Hook:** Stand inland and the sun rides high; walk to the water and it sinks into the sea.

**Plain:** The sun and moon aren't painted at fixed heights — their
elevation follows where you stand, easing from overhead on the plateau
down to a true ocean set at the waterline, where the water physically
hides the bottom of the disc. A guard makes sure the disc never fully
drowns while you're looking at it from the beach.

**Technical:** Disc elevation is a smooth function of the player's
polar angle, easing to a waterline endpoint where the disc sits ~40%
submerged below the sea horizon — the ocean geometry occludes it, no
masking. The set FLOOR is enforced in screen terms: each frame the
ocean limb's angular direction is computed analytically from the
camera, and if the solved disc would show less than ~55% above the
limb, a few-step bisection corrects the disc's polar angle before
smoothing. `e2e/setcheck.mjs` samples rendered frames and asserts the
visible fraction.

**Files:**
- `src/scene/useSkyState.ts` — the elevation solve, limb math, set floor
- `src/scene/planetConfig.ts` — `CELESTIAL_ELEVATION_INLAND_DEG`, `CELESTIAL_ELEVATION_WATERLINE_DEG`
- `e2e/setcheck.mjs` — the acceptance with teeth

**Decisions:**
- An input-dial elevation floor was rejected: it couldn't guarantee
  the on-screen result, because the rendered framing composes the
  disc solve, world rotation, AND near-limb occlusion. The floor moved
  to "fraction of disc visible", measured the way the player sees it.
- The floor applies only within ±35° of the body's meridian, so the
  walking-away set stays fully emergent — the sun still sets behind
  you mid-crossing.

## 06 · A glitter path that belongs to you {#glitter}

**Hook:** The sparkle lane on the water always points at you — not at the camera.

**Plain:** On real water, the glitter path runs from the sun to your
eyes. Here it runs from the sun to the CHARACTER, so orbiting the
camera changes your view of the lane without moving it. It's a
deliberate stylization for a third-person game: the light belongs to
the person on the beach, and it walks with you.

**Technical:** The water's vertex shader displaces 2–3 summed sines;
the fragment side perturbs the normal analytically from the same sine
sum (plus normal-only micro-ripples), then computes a Blinn specular
term per light body — with the VIEWER term being the avatar's fixed
world eye position passed as a uniform, never `cameraPosition`. A
great-circle corridor from the disc base through the character clamps
the footprint (meters-wide, monotonically widening toward shore, edges
wobbled by time noise), and the whole thing fades into the foam band
by water depth.

**Files:**
- `src/scene/Water.tsx` — `onBeforeCompile` shader, the corridor stencil
- `src/scene/planetConfig.ts` — `GLITTER`
- `e2e/setcheck.mjs` — lane-present and living-edge assertions

**Decisions:**
- A fixed-azimuth painted band was the first version — rejected, it
  ignored both bodies and the player.
- Camera-eye specular was rejected: orbiting swung the entire lane,
  which reads as a rendering artifact in third person.
- An azimuth-cone corridor from the eye was rejected because it
  pinches to an arrow point at the viewer's nadir — the corridor's
  half-width is perpendicular arc distance in METERS instead.

## 07 · A villager built from spheres and math {#character-rig}

**Hook:** Nobody modeled this character — it's assembled from primitive shapes and animated by arithmetic.

**Plain:** The avatar is stacked spheres, capsules, and boxes in
Animal-Crossing proportions: a huge head, a teardrop body, stubby
limbs. There's no skeleton and no animation files — walking, running,
jumping, strumming, and sitting are all math driving the joints every
frame. The whole cast (the player, Koa the ukulele player, future
NPCs) shares one parameterized rig.

**Technical:** `buildNodes(config)` constructs merged vertex-colored
geometry per body part from a `CharacterConfig` (hair style, glasses,
outfit, dozens of proportion dials); limbs hang from pivot groups with
nested elbow pivots. `STATES` holds per-locomotion animation params
(bob, swing, lean) crossfaded by lerp; foot plants fire from swing
phase crossings — never timers — which is what drives surface-switched
footsteps. NPC specifics (Koa's strum, the avatar's seated pose)
compose through a `poseHook` that runs after the shared animation.

**Files:**
- `src/scene/BlockyCharacter.tsx` — `buildNodes`, `STATES`, `AIR_POSE`, the `poseHook` contract
- `src/content/characters.ts` — `AIDEN`, `KOA`, the config dials
- `src/scene/UkulelePlayer.tsx` — torso-mounted instrument, numerically solved arms

**Decisions:**
- An imported CC0 glTF avatar (plus Draco decoding) shipped briefly
  and was fully reversed in the style reset — the look fought the
  world, and the pipeline cost wasn't buying anything primitives
  couldn't do.
- Skeletons and `AnimationMixer` were rejected: pivot groups plus
  procedural math are smaller, deterministic, and testable.
- The first blocky rig was rebuilt ROUNDED (v3.15): flattened-sphere
  head, teardrop torso — smooth-shaded characters on a flat-faceted
  world is Animal Crossing's own move.
- Koa's uke taught two rules the hard way: held props mount in TORSO
  space with named landmarks (root-space anchors detach), and prop
  orientation comes from explicit basis vectors — Euler guessing in
  the wrong basis is what turned the uke sideways.

## 08 · Sound that starts from silence {#audio}

**Hook:** Every wave, gull, footstep, and strum is either Aiden's own recording or synthesized on the spot — and none of it exists until you touch the page.

**Plain:** The audio system is fully lazy: nothing loads or even
constructs an audio context before your first click or keypress. From
there, each sound category draws from a pool of the owner's recorded
cuts with a shuffle that never repeats back-to-back; categories with
no recordings yet fall back to sounds generated by code. Footsteps
know what you're walking on; the campfire is loud only when you're
near it.

**Technical:** `nextBuffer(category)` resolves from `import.meta.glob`
pools (drop a file in — zero code changes) through a depth-2
`ShuffleBag`, decode-once cached, mono-downmixed for positional use.
Foot plants come from the animation and route through
`surfaceUnderfoot`; jumps are WebAudio-scheduled double-taps. The
hard-won parts are defensive: `syncPanner` (three.js only updates
panners for nodes it started itself — custom-source nodes silently sit
at the planet's center), and the tab-return protection — hidden tabs
suspend the context, `onAudioResume` resets every scheduler baseline,
stall guards skip forward rather than replaying backlogs, and
`registerVoice` caps concurrent voices per pool.

**Files:**
- `src/audio/core.ts` — `nextBuffer`, `playDoubleTap`, `syncPanner`, `registerVoice`, `onAudioResume`
- `src/audio/bag.ts` — `ShuffleBag`
- `src/audio/footsteps.ts` — `stepSound`, `jumpTaps`
- `src/audio/loops.ts` — `CrossfadeLoop`
- `src/scene/AudioEmitters.tsx` — `musicTarget`, `crackleTarget`, `cryGain`

**Decisions:**
- Howler and Tone were rejected — three.js's own audio nodes cover it,
  and the bundle stays clean.
- The silent-uke bug: strums scheduled onto a PositionalAudio's panner
  never moved with the world, because three only updates panners while
  `isPlaying`. Custom-source nodes now sync every frame.
- The gulls went through a "one distance authority" reform: a designed
  launch-gain curve stacked on a tight panner rolloff multiplied cries
  to near-zero; the curve is now the single authority with the panner
  relaxed beneath it.
- The tab-return blast: catch-up scheduling replayed every missed
  strum at once. Suspend-on-hide (a frozen clock has nothing to catch
  up to) + baseline resets + skip-forward guards + voice caps, each a
  separate layer because each failure mode showed up separately.

## 09 · Why draw calls beat triangles {#budgets}

**Hook:** The island runs at 60 fps on a phone not by having less stuff — but by asking the GPU fewer times.

**Plain:** The performance budget is counted in draw calls — how many
separate "please draw this" requests hit the GPU per frame — because
on this kind of scene each request costs more than the triangles
inside it. Repeated props render as single instanced batches; merged
props fuse into one object per material; the whole world stays under
50 requests on mobile.

**Technical:** `e2e/measure.mjs` records fps, `renderer.info.render.calls`,
and triangles at spawn, mid-dock, and the night beach against the
preview build — the budget gates every feature commit. Repeats
(palms, rocks, dock planks, campfire stones) go through instancing or
`mergeByMaterial`; the fire's six animated tongues are ONE
InstancedMesh; vertex-tinted merges collapse multi-material props to
a single call. `PerformanceMonitor` drops a `qualityTier` that thins
particles and stars on sustained decline — but never to zero (the
empty-sky lesson).

**Files:**
- `e2e/measure.mjs` — the budget instrument
- `src/scene/props.ts` — `mergeByMaterial`, `paletteMaterial`
- `src/scene/instancing.tsx` — `StaticInstances`, `InstancedProp`, `surfacePartMatrix`

**Decisions:**
- Triangle-first optimization was explicitly rejected in the spec:
  the island's ~36k triangles are nowhere near any limit, but 50+
  draw calls on mobile is.
- The budget has teeth in practice: the music prop merged from three
  materials to one vertex-tinted mesh the day spawn hit exactly 50,
  and the fire's teepee and stones merged when a fix pass nudged it
  again.
- A blanket quality-tier gate on the fire's particles was replaced
  with a reduced-pool floor — degradation should thin a scene, never
  delete its life.

## 10 · Content without touching the scene {#content-pipeline}

**Hook:** Every photo, project, and song on the island can change without anyone opening the 3D code.

**Plain:** All portfolio content lives in a handful of plain data
files — the scene reads them, never the other way around. Photos drop
into a staging folder and a script resizes and compresses them into
web and thumbnail sizes; audio recordings drop into category folders
and join the sound pools automatically; every category shows a
friendly empty state until it's filled, so a half-finished site never
looks broken.

**Technical:** `src/content/*.ts` exports typed arrays consumed by the
modals and the `/classic` fallback page. `scripts/optimize-images.mjs`
runs originals through a headless-Chromium canvas (no image deps) into
1800 px WebP plus 480 px thumbs with recorded intrinsic dimensions —
the gallery never guesses aspect ratios. `scripts/ingest-audio.mjs`
normalizes and verifies the owner's cuts into pools resolved by
`import.meta.glob`. `CONTENT.md` documents every field against the
actual interfaces; `CREDITS.md` tracks provenance — only license-clean
sources ship.

**Files:**
- `src/content/photos.ts` — the `Photo` interface, curated order
- `scripts/optimize-images.mjs` — staging → web + thumb WebP
- `scripts/ingest-audio.mjs` — the audio library ingest
- `src/ui/modals/EmptyState.tsx` — never-look-broken

**Decisions:**
- A CMS or MDX layer was never on the table — six typed arrays are
  the right amount of infrastructure for one person's portfolio.
- `sharp` (the standard image library) was rejected under the
  no-new-deps rule; Playwright was already installed for testing, so
  image processing runs through a real browser canvas instead.
- WebP-only output, no JPEG fallback: every supported browser decodes
  WebP, and a fallback would double the asset set for zero users.
- The photos taught a provenance rule now written into the spec: only
  what the owner deliberately stages ships — an agent must never
  source content from personal folders or exports, even helpfully.
- The mirror rule (the owner's principle): everything in the world is
  also on /classic — same content files, one is playable. Shared
  components enforce it where logic is involved: the Formspree contact
  form is ONE component rendered by both the mailbox modal and the
  classic page, so the two can never drift.

## 11 · The moai {#hedge-stone}

**Hook:** The About page is a giant Easter Island head gazing over the plateau at the edge of dusk.

**Plain:** Where a big tree used to hold the About portal, a
three-meter moai now watches the dusk boundary — walk up from any
side, press E, and read who built the island. It went through three
forms in a day: a modest carved stone, then the moai in a hedge
ring, then the moai alone — the owner cut the hedge, and with it the
invisible fencing that made walking near it feel like snagging on
nothing.

**Technical:** `buildHedgeStone` (the id is historical) assembles the
moai from rounded boxes per the style bible: an elongated tilted-back
head, one heavy brow ridge proud of the face, darker recess boxes for
the eye hollows, a long nose shaft ending in a wide base, two thin
bars with a shadow seam for the pursed lips, long side ears, and a
small torso with arm slabs meeting in chip-colored hands — all
vertex-tinted and merged into ONE draw call, facing the northern
approach via `meridianYaw`. Collision is a single snug 1.1 m
slide-along blocker on the statue (arms reach ±0.83 m): impossible to
walk through, free to circle, with the 2.5 m interact trigger firing
on every side.

**Files:**
- `src/scene/props.ts` — `buildHedgeStone`
- `src/content/interactables.ts` — the About def (`prop: 'hedgestone'`, `blockRadius`)
- `src/scene/Interactable.tsx` — `PROP_BUILDERS`

**Decisions:**
- The big tree + rings (and the placeholder cube beside the trunk)
  were removed outright rather than kept as scenery — two objects
  meaning one thing confused the read.
- v1 was a waist-high slab in a small hedge ring; the owner asked for
  the moai (Easter Island references). Kept across versions: the
  vertex-tinted single-merge pattern, the grey-green palette, the
  face-the-approach rule.
- The hedge ring and its three invisible arc-guard blockers were CUT:
  circular blockers approximating a ring left seams and outer reaches
  that stopped players on empty grass — "I get stuck on nothing" is a
  worse bug than any hedge is worth. The lesson generalizes: colliders
  must trace something the player can SEE. Verified by walking full
  laps in both directions (zero stuck steps) and four-sided walk-ins
  stopping only at the visible statue.

## 12 · The bulletin board {#bulletin-board}

**Hook:** A corkboard by the path holds the practical papers — starting with the resume.

**Plain:** Inland from the mailbox stands an Animal-Crossing-style
bulletin board: two posts, a little sloped roof, and a cork face full
of pinned pages. Read it and a Papers panel lists real documents you
can view in the browser or download — the professional side of the
island, pinned where visitors walk.

**Technical:** `buildBulletinBoard` is one vertex-tinted merge: posts,
a weathered green frame, an inset cork face, a seated sloped roof, six
paper quads at slight rotations with colored pin dots, and two curled
corner flaps. The `papers` modal renders `content/papers.ts` entries
as plain View (new tab — the browser's own PDF viewer) and Download
links, so no PDF bytes move until a click; `/classic` mirrors the
section per the mirror rule. Files live in `public/`.

**Files:**
- `src/scene/props.ts` — `buildBulletinBoard`
- `src/content/papers.ts` — the `Paper` interface
- `src/ui/modals/PapersModal.tsx` — the modal

**Decisions:**
- An embedded PDF iframe viewer was rejected: it fetches on modal
  open, styles inconsistently across browsers, and the browser's own
  tab viewer is strictly better at its one job.
- The resume shipped as a marked PLACEHOLDER: the real file's header
  carries a phone number, and the standing privacy rule says no
  version with a phone or home address ever ships — the owner strips
  it and swaps the file, no code change needed.

## 13 · The minimap {#minimap}

**Hook:** A little compass-map in the corner remembers everywhere you've been.

**Plain:** The circular minimap keeps the sunset side at the top like
a compass, shows the island's grass, beach, and waterline, and starts
covered in fog — walking reveals it cell by cell, and the reveal is
remembered between visits. Portals appear as labelled dots once
you've found their neighborhood. M (or the menu) hides it.

**Technical:** A 2D canvas overlay — deliberately not a second
three.js scene — redrawn at 10 Hz (5 Hz on low tier) with zero
per-frame allocations. `projectPolar` maps lat/long to map pixels
(pole at centre, long 0 up); the player's position derives from the
live planet quaternion via `poleInPlanetSpace` — the same math the
world runs — and the facing cone from the established azimuth↔north
mapping. Exploration is an 8×24 cell grid (`cellIndex` /
`cellsWithinRange`, 6 m discovery radius, vitest-pinned), eased in
over 0.4 s (instant under reduced motion), persisted under a
versioned localStorage key with a no-storage fallback, and resettable
from the HUD menu.

**Files:**
- `src/ui/minimapMath.ts` — `projectPolar`, `cellIndex`, `cellsWithinRange`, `loadExplored`
- `src/ui/Minimap.tsx` — the canvas overlay
- `src/store/useStore.ts` — `toggleMinimap`, `resetExploration`

**Decisions:**
- A second three.js scene for the map was ruled out by the task spec
  and would have doubled renderer state for a HUD widget; canvas 2D
  draws the whole thing in one pass.
- 10 Hz updates instead of per-frame: a minimap doesn't need 60 fps,
  and the player marker moving at 10 Hz is imperceptible at 130 px.
- Fog is per-cell wedges over a fully-drawn map rather than masking
  the draw — simpler, and the eased reveal is just an alpha ramp.

## 14 · The memorial garden {#memorial-garden}

**Hook:** A quiet walled corner of the island where remembrances live.

**Plain:** Just past the terminator on the night-leaning side sits a
small stone-walled garden with an arched wooden gate, two rows of
headstones, a bench, and flowers. The front-row stones can be read —
"E — Remember" opens a quiet card with a name, years, relation, and a
message. At night the garden holds a faint warm glow and slow
fireflies; it never gets bright. The same remembrances appear on
/classic under Memorials. Three placeholder stones ship until Aiden
writes real ones.

**Technical:** The statics (`buildCemetery`: 14-block wall ring with a
~70° northern opening, gate posts + lintel, decorative back-row
stones, bench, flower clusters) are one vertex-tinted merge — one
draw call — placed via the MAP table; interactable headstones are a
new `PropKind 'headstone'` reusing the standard prop pipeline with a
new `ModalKind 'memorial'` reading `src/content/memorials.ts` by
`contentKey`. Blockers trace the VISIBLE wall (five r-1.15 circles on
ring bearings that skip the gate, plus two gate-post circles) so the
interior stays fully walkable — the moai lesson applied. The night
mood is `<Cemetery/>`: one 12-point fireflies Points pool (blink +
orbit from seeded params, zero allocations per frame) and two
PointLights, all scaled by `smoothstep(nightMix, 0.45, 0.8)` and
skipped on low tier.

**Files:**
- `src/content/memorials.ts` — the entries + the consent rule
- `src/scene/props.ts` — `buildCemetery`, `buildHeadstone`
- `src/scene/Cemetery.tsx` — fireflies + glow
- `src/ui/modals/MemorialModal.tsx` — the quiet card

**Decisions:**
- CONSENT RULE recorded in the content file and CONTENT.md: names and
  photos of living people require their explicit okay before shipping
  publicly; pets are Aiden's call. Placeholders ship in the meantime
  and say so in the modal.
- The glow is deliberately dim (0.35/0.28 peak intensity, distance 4)
  — the spec said "never bright"; the space should read hushed next
  to the campfire's warmth, not compete with it.
- Fireflies are a Points pool like the embers, not meshes — one draw,
  tier-gated, night-gated, with the same parked-at-9999 idle pattern.

## 15 · The portal room {#matrix-room}

**Hook:** A glitching doorway on the night side opens into the making-of.

**Plain:** Past the terminator stands a dark stone archway with a
green pane humming inside it. Stepping through drops you into a black
room with code rain falling around you, where you can read how every
part of this island was built — including the real source code, the
experiments that failed, and why certain things are the way they are.
E steps back out through the inner portal. The same chapters read as
plain text on /classic under Build log.

**Technical:** The room mounts inside the SAME canvas — never a second
WebGL context: `openModalId === 'matrix'` flips the planet group and
avatar to `visible={false}` (the subtree stops drawing) and lazily
mounts `MatrixRoomScene`, which parks itself at the camera's position
and yaw. Both halves are code-split, so nothing about the room touches
the initial payload. The rain uses no new shaders: a procedurally
generated canvas glyph atlas (`makeGlyphAtlas`, playbook §3's
generated-tile caveat) is sampled by tall quads whose UVs are baked to
one atlas column each with a random phase; the columns merge into
three geometries sharing three materials whose `map.offset.y` scrolls
at different speeds. Whole room: 13 draw calls, 732 triangles. Chapter
text and the code excerpts come from `docs/build-log.json`, exported
from this very file at build time — the room is documentation
rendering itself.

**Files:**
- `src/scene/matrixAtlas.ts` — `makeGlyphAtlas`
- `src/scene/MatrixRoomScene.tsx` — `MatrixRoomScene`, `buildRainGroup`
- `src/ui/modals/MatrixRoom.tsx` — the chapter reader
- `src/content/buildLog.ts` — `buildLogChapters`

**Decisions:**
- A second `<Canvas>` for the room was rejected: two WebGL contexts
  double renderer state and risk context loss on mobile. Hiding the
  planet group costs nothing and drops the scene to the room's own 13
  calls — measured, and pinned by an e2e assertion under 50.
- Rain as scrolling UV strips instead of per-glyph instances or a
  custom shader: the two-shader rule (dome + water) stands, and three
  merged geometries beat 90 instanced quads with per-frame matrix
  writes.
- The room reads `build-log.json` rather than duplicating prose in a
  content file — one source of truth, and the excerpts stay honest
  because they are captured from the real files at build time.

## 16 · Making the type real {#self-hosted-fonts}

**Hook:** The site had specified its typefaces for months and never
actually loaded them.

**Plain:** Two fonts were named in the stylesheet — Bricolage Grotesque
for headings, Atkinson Hyperlegible (a typeface designed for low
vision) for body text — but nothing ever fetched them, so every visitor
saw their operating system's default. They now ship with the site
itself rather than being requested from Google, which means no third
party learns you visited. Alongside that: icons at every size a browser
or phone launcher asks for, a web manifest, and the canonical link
search engines want.

**Technical:** `scripts/fetch-fonts.mjs` downloads the latin woff2
subsets into `public/fonts/` and generates `src/fonts.css` with
`@font-face` rules and `font-display: swap`; `src/index.css` imports it
next to the `@theme` tokens that name the families. Latin-only keeps
the payload at 109 KB — latin-ext, vietnamese, and cyrillic would
roughly triple it for glyphs this site never renders.
`scripts/make-favicons.mjs` renders `favicon.svg` at 16/32/192/512 and
180 (apple-touch) through headless Chromium, the same
no-new-dependency trick `optimize-images.mjs` uses.

**Files:**
- `scripts/fetch-fonts.mjs` — the downloader/generator
- `scripts/make-favicons.mjs` — SVG → PNG icon set
- `src/fonts.css` — generated `@font-face` rules
- `public/site.webmanifest` — install metadata

**Decisions:**
- Self-hosting over a fonts CDN. Nothing else in this project makes an
  external runtime request, and a CDN font link tells a third party
  about every visitor for no benefit the local file doesn't give.
- The first version shipped Bricolage twice. Asking Google for weights
  400 and 700 of a VARIABLE font returns the same 75 KB file under two
  URLs — the script now dedupes by content hash and emits one face with
  a `font-weight: 400 700` range, halving the font payload.
- Latin subsets only, and `font-display: swap` so text is readable
  immediately in the fallback rather than invisible while fonts load.
