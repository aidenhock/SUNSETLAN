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

**Hook:** A little map in the corner that keeps you at the centre of the world.

**Plain:** The circular minimap is a bird's-eye view of the island with
you always in the middle and whatever you are facing pointing up — walk
and the island slides under your marker, turn and the map turns with
you. Everything is on it from the first second: no fog to clear, no
progress to grind.

It reads like a map of a real place rather than a list of pins. Grass
is green and the beach is sand; palms are green blobs and rocks grey
ones; every landmark is its own colour, and the two big things are
drawn as the shape you actually walk — the cemetery as its walled plot,
the dock as the strip running out over the water. Nothing is labelled;
you learn the island by its shapes. The sea carries the island's two
moods, warm blue toward the sunset meridian and deep night-blue toward
the other, with the sun and moon marked out on the water where they
really hang — and pinned to the rim when they fall off the edge, so the
map always tells you which way each side is.

M (or the menu) hides it. Step through the rift and the same little
window switches to a plan of the room you are standing in.

**Technical:** A 2D canvas overlay — deliberately not a second three.js
scene — redrawn every animation frame with zero per-frame allocations,
so the map tracks continuously instead of catching up when you stop.
The projection is azimuthal around the PLAYER: `playerFrame` builds the
tangent frame under the avatar from the live planet quaternion, then
every target becomes a `rangeTo` (great-circle metres) and a `bearingTo`
(radians from local north). `cameraHeading` converts the camera's world
forward into the same frame and `toScreen` subtracts it, so the heading
points up. The island is drawn by projecting two 64-point latitude
rings, which stay correct under any rotation; `roomToScreen` does the
same job for the room's flat rectangle.

Everything on it comes from the world index, so moving a monument moves
its icon: `mapIcons.ts` holds appearance only (colour, shape, size) and
derives positions from `monuments.json` and `scatterProps`. Footprints
are real geometry — the cemetery's four corners come from its recorded
`size` and facing, each converted at ITS OWN latitude. The sea gradient
runs along the projected sun→moon axis, so it rotates with the map.

**Files:**
- `src/ui/minimapMath.ts` — `playerFrame`, `bearingTo`, `toScreen`
- `src/ui/Minimap.tsx` — the canvas overlay
- `src/ui/mapIcons.ts` — `MARKERS`, `CEMETERY_FOOTPRINT`, `SUN_UNIT`
- `src/content/monuments.ts` — where everything on it stands

**Decisions:**
- A second three.js scene for the map was ruled out and would have
  doubled renderer state for a HUD widget; canvas 2D draws it in one
  pass.
- Exploration fog was built, shipped, and then REMOVED at the owner's
  call: a portfolio should not ask visitors to grind for its own map.
  The 8×24 cell grid and its localStorage persistence went with it.
- Labels came off. Twelve names on a 130 px disc was most of the map's
  ink, and it read as a legend rather than a place; colour and shape
  carry it now, the way a Minecraft map does.
- The cemetery's corners each convert at their own latitude. Using the
  plot's centre for all four — the obvious version — drew its north
  edge 2.4 m short of the fence you can walk, because a degree of
  longitude shrinks as you go north. A test pins the real size.
- North-up was replaced by camera-up with the player pinned at the
  centre. A fixed-north map is a better compass; a player-centred one
  is a better answer to "what is near me", which is the question this
  island actually raises.

## 14 · The memorial garden {#memorial-garden}

**Hook:** A quiet fenced corner of the island where remembrances live.

**Plain:** Past the terminator on the night-leaning side is a walled
garden: an iron fence on chunky stone posts, a gate you walk in
through, a stone path, rows of headstones with flowers in front of
them, a bench, and lanterns. The front row can be read — "E — Remember"
opens a quiet card with a name, years, relation, and a message. At
night the garden holds a faint warm glow and slow fireflies; it never
gets bright. The same remembrances appear on /classic under Memorials.
Three placeholder stones ship until Aiden writes real ones.

**Technical:** The plot is 17 × 13 m — big enough to walk around
inside, which is far past the ~4 m limit where a flat mesh laid on a
55 m sphere sags mid-span and buries its corners. So `buildCemetery`
builds everything flat in local space and then bends it with
`wrapToSphere`, which maps each vertex through the same geodesic offset
the walk controller uses; the whole garden stays ONE vertex-tinted
merge — one draw call, ~5.1k triangles. Blockers are generated from the
same rectangle at ~1 m pitch, skipping the gate gap, so they trace the
fence you can see (the moai lesson) and never touch the interior. The
night mood is `<Cemetery/>`: a 12-point firefly pool and two
PointLights, both scaled by `smoothstep(nightMix, 0.45, 0.8)` and
skipped on low tier.

**Files:**
- `src/content/memorials.ts` — the entries + the consent rule
- `src/scene/props.ts` — `buildCemetery`, `buildHeadstone`
- `src/scene/geometryUtils.ts` — `wrapToSphere`
- `src/scene/Cemetery.tsx` — fireflies + glow

**Decisions:**
- CONSENT RULE recorded in the content file and CONTENT.md: names and
  photos of living people require their explicit okay before shipping
  publicly; pets are Aiden's call. Placeholders ship in the meantime
  and say so in the modal.
- The first version was a 3.2 m circular stone ring — too cramped to
  walk in, and nothing like the Animal Crossing gardens it was meant to
  echo. Rebuilding it big forced `wrapToSphere`, which is now the
  general answer to placement rule 2 for anything wider than a few
  metres.
- The glow is deliberately dim (0.35 / 0.28 peak, distance 4): the
  space should read hushed next to the campfire's warmth, not compete
  with it.

## 15 · The room through the rift {#matrix-room}

**Hook:** A tear in the air on the night side opens into a room you can
run around in.

**Plain:** A shard of broken light hangs over the grass past the
terminator. Step into it and you are standing in a rectangular room:
walls of falling ones and zeroes running endlessly above and below a
glass floor, a framed screenshot of every feature on this island hung
around you, and the rift itself hovering in the middle. The pictures
hang IN THE ORDER THE WORK HAPPENED, each with its step number over it:
01 is at the left of the wall you arrive facing, and the sequence runs
clockwise, so walking the room walks the history of the island. Walk up
to any picture and press E to read how that piece was built — in plain
language first, then the real code. Some features need more than one
frame to show (the two skies, the sun's arc, the map inside and outside
this room), so those come as a small set you click through with arrows,
with dots underneath that light up as you look at each one. Walk back
into the rift to come home. The minimap comes with you and redraws
itself as a plan of the room.

The same chapters, pictures, and arrows are on the classic site under
Build log, as a numbered dropdown you can step through — with its own
row of dots that fills in as you read your way along.

**Technical:** The room is a second walkable space, not a dialog, and
it keeps the island's central invariant: THE AVATAR NEVER MOVES. The
room group slides underneath it instead (`useRoomController`), so the
camera rig, jump arc, avatar animation, and footstep hooks all work
unchanged; only "where am I" changes, and that lives in `roomRuntime`.
Walls clamp per axis so diagonals slide, and the follow camera marches
its own ray to the nearest wall so it never ends up outside looking in.
Entering flips `inRoom`: the planet group and the sky rig stand down
(the planet's draws stop entirely) and `RoomScene` mounts from a lazy
chunk. The wallpaper is a generated canvas of 0s and 1s scrolled by
`map.offset.y` — no new shader, the two-shader rule stands. The mural
images are the one place this project uses image textures, and they are
screenshots of itself, captured by `scripts/capture-murals.mjs`; each
mural declares an ordered `shots[]` and the wall hangs the first, so
the room still costs one texture per frame no matter how many pictures
a feature carries. Placement is derived, not authored: each chapter's
`step` (its position in this file) sets both the number on the plate
and the wall slot, dealt clockwise by largest-remainder over wall
length — add a chapter and the whole room re-flows. The plates share
one generated number atlas and merge into a single draw call. The
picture viewer itself (`PictureCarousel`) and the glowing progress rail
(`StepDots`) are shared components: the room's mural modal and the
classic site's build log render the same code, the way `ContactForm`
already serves both surfaces.
Chapter text comes from `docs/build-log.json`, exported from this file
at build time — the room is documentation rendering itself.

**Files:**
- `src/controls/useRoomController.ts` — `useRoomController`, `ROOM`
- `src/scene/RoomScene.tsx` — `RoomScene`
- `src/content/murals.ts` — which screenshot explains which chapter
- `src/scene/riftGeometry.ts` — `buildRift`

**Decisions:**
- The first version was a MODAL: a reader panel over a static 3D
  backdrop with the camera parked. It was cheap and it was wrong — the
  whole promise of a portal is that you go somewhere. Rebuilt as a
  place you walk in.
- A second `<Canvas>` was rejected: two WebGL contexts double renderer
  state and risk context loss on mobile. Hiding the planet costs
  nothing and drops the scene to the room's own ~23 draw calls.
- Moving the room instead of the avatar looks like a trick, but it is
  the same trick the island runs, and it means one camera rig and one
  animation system serve both spaces.
- Progress dots track this VISIT only, with no localStorage. The same
  question came up for the minimap's exploration fog and got the same
  answer: a portfolio shouldn't ask anyone to grind through it, and a
  returning visitor shouldn't be told what they already read.
- The rail fills to the FURTHEST chapter reached, not the current one —
  stepping back to re-read something must not un-light it.
- The room's running order is the build log's own order rather than a
  hand-placed layout. Hanging pictures by hand would have drifted from
  the chapters within a session; deriving both the number and the slot
  from `step` means the room can only ever tell the true story.
- Multi-shot murals are declared in content and captured by script,
  and vitest compares the two lists in BOTH directions. A mural naming
  a file nobody captured used to hang a silent black frame on the wall;
  an orphaned capture is just as wrong, so both now fail the suite.

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

## 17 · The world index {#world-index}

**Hook:** Every object on the island now lives at coordinates you can
edit in one file.

**Plain:** Where the dock is, which way the moai faces, how high the
rift floats — all of it used to be scattered through the code that
draws each thing. Now there is a single list, `monuments.json`, with a
line per object: latitude, longitude, the direction it faces, and how
far off the ground it sits. Move a number, and the model, its collision,
its dot on the minimap, and the printed world map all follow. There is
a readable version of the list at `docs/world-map.md`.

**Technical:** `src/content/monuments.json` is the data (plain JSON so
node scripts and the app read the same file); `monuments.ts` wraps it
with types and `monument()` / `monumentPos()` / `monumentYaw()`, which
throw loudly on an unknown id rather than silently placing something at
the origin. `planetConfig.MAP` is now DERIVED from it, so every existing
consumer of MAP inherited the indirection for free, and `interactables.ts`
takes its rotations from `facingDeg` instead of hardcoded radians.
`scripts/world-map.mjs` regenerates the docs table. Vitest guards the
things that silently break a world: duplicate ids, coordinates off the
island, and interactables whose monument has gone missing.

**Files:**
- `src/content/monuments.json` — the index itself
- `src/content/monuments.ts` — `monument`, `monumentPos`, `monumentYaw`
- `scripts/world-map.mjs` — regenerates `docs/world-map.md`
- `src/scene/planetConfig.ts` — `MAP`

**Decisions:**
- JSON, not TypeScript, for the data half. It keeps the file editable
  by tooling and by hand without a build step, and the typed wrapper
  gives the app everything it would have gotten from a `.ts` literal.
- `facingDeg` is measured from local NORTH, not from world axes, because
  north is the only direction that means anything on a sphere you walk
  around. It is degrees rather than radians purely because a human edits
  this file.
- MAP was kept rather than replaced. Rewriting every `MAP.campfire`
  call site would have been a large diff with no behaviour change; one
  derived table costs nothing and keeps the index authoritative.

## 18 · Turning the phone {#rotate-nudge}

**Hook:** The island wants a wide screen, and no website can turn your
phone for you.

**Plain:** On a phone held upright, the world opens with a card asking
you to turn it sideways — the island is far wider than it is tall, and
landscape gives you the whole horizon. Turn the phone and the card
disappears by itself. On Android there's a button that does it for you.
On an iPhone there isn't one, because Safari doesn't let a website
rotate anything; so instead, if you've turned the phone and nothing
happened, the card explains the real cause — Portrait Orientation Lock
— and where to switch it off. There is always a "play in portrait
anyway" button, because the island really does play upright, and
someone whose rotation is locked must never be shut out of a portfolio.
The classic site never shows any of this: it's a document, and upright
is right for it.

**Technical:** `RotateNudge` mounts on the world route only (App, next
to `ModalRoot`, outside the `inert` wrapper so it shows over an open
modal). It watches one media query — `(orientation: portrait) and
(max-width: 820px) and (pointer: coarse)` — which keeps tablets out of
it and hides the card the instant the device turns. The lock path is
pure feature detection: fullscreen the document element, then
`screen.orientation.lock('landscape')`, with any failure falling
through to the help text rather than an error. Safari implements
neither call, which is why the button is absent there rather than
broken. Dismissal is `sessionStorage`, so it lasts the visit and not
beyond. The e2e helper pre-dismisses it so the gameplay suites still
drive the world directly, and the nudge has its own test.

**Files:**
- `src/ui/RotateNudge.tsx` — `RotateNudge`, `tryLockLandscape`
- `src/App.tsx` — where it mounts
- `e2e/helpers.ts` — `gotoWorld`
- `src/index.css` — the tipping-phone keyframes

**Decisions:**
- A hard gate was rejected. It is the obvious way to guarantee
  landscape, and it fails exactly the visitors who cannot fix it: with
  rotation lock on, turning the phone does nothing, and a gate becomes
  a dead end whose only exit is leaving the site.
- Rendering the whole app rotated 90° with a CSS transform — the trick
  HTML5 game portals use, and the only way to beat rotation lock on
  iOS — was considered and skipped. It would have forced axis remapping
  through the orbit drag, the touch joystick, and pointer picking, three
  of the most delicate input paths here, for a payoff the "play anyway"
  button already covers.
- The rotation-lock help is time-triggered (five seconds) rather than
  shown up front. Leading with troubleshooting assumes the visitor has
  a problem; most just turn the phone and never see it.

## 19 · A world you can drag {#world-editor}

**Hook:** The island is now editable from inside itself.

**Plain:** Everything on the island — every prop, portal, palm and rock
— lives in one file of coordinates. In development you can open the
world with `?editor` (or press F2) and rearrange it.

The main tool is a plan view: the island seen from above, holding still,
with everything on it as a dot you can drag. Blocker radii are drawn at
their true size, so two things fighting over the same ground is obvious
at a glance; a stalk on the selected item turns it; the wheel zooms and
the background pans. Faint lines tie a monument's parts to it, so you
can see what will come along before you drag. You can still click props
in the 3D world to select them, and nudge with the arrow keys, but the
laying-out happens on the map.

Sliders set size and collision, there's a palette to place new props,
duplicate and delete, and full undo. When it looks right, one button
writes the file back to disk.

It warns before you make a mess: something placed past the waterline,
two things whose collisions overlap enough to wedge the player, or a
placement that pushes the scene over its draw-call budget.

None of this ships. The editor is stripped from production builds
entirely, and a check in the build asserts it.

**Technical:** Placements moved out of three scattered sources into
`content/placements.json`, and the scene reads them through
`scene/placementRuntime.ts` — a small store initialised from the file.
In production nothing mutates it, so the world IS the file; in the
editor every change goes through a command stack (whole-list snapshots,
since 41 entries are cheap) and rebuilds the blocker array IN PLACE, so
a dragged prop's collision moves with it and the cemetery's generated
fence regenerates around the plot. Picking is analytic rather than a
raycast against terrain: the screen ray meets a sphere of the planet's
radius, and that point converts straight back to lat/long — the numbers
the file stores. Altitude is never editable; it always comes from
`groundAltitudeAt − SINK_M`. The panel and the 3D helpers are behind
`import.meta.env.DEV`, which Vite folds to `false` in a build so Rollup
drops the dynamic imports and emits no chunk.

**Files:**
- `src/content/placements.json` — the world
- `src/scene/placementRuntime.ts` — `usePlacementRuntime`, `serialize`, `warningsFor`
- `src/editor/MapEditor.tsx` — the plan view
- `src/editor/mapProjection.ts` — `project`, `unproject`
- `src/editor/EditorOverlay.tsx` — the panel

**Decisions:**
- Parity was proven rather than eyeballed. `worldParity.test.ts` digests
  every blocker and interactable; the interactable digest came out
  byte-identical, and a third test reconstructs the old blocker list
  from the new one to show the only difference is a duplicate mailbox
  collider that sat inside its own. The guard immediately earned itself
  by catching a crate collider I had written 0.8° off its prop.
- The round-trip check earned itself too: it failed twice on real
  defects — the serializer rounded yaw to one decimal and lost a baked
  51.57°, and whole numbers were being written as `40.0` where the
  editor writes `40`. "Lossless" has to mean bytes, or the file churns
  every time anyone opens the editor.
- Dragging things around the 3D world was the first version and the
  wrong one: it means fighting a camera, a horizon and a sphere to do
  what is really a two-dimensional job. The plan view uses its own
  projection — north-up, island-centred, and crucially INVERTIBLE, so a
  pixel maps straight back to a lat/long and a thing lands exactly where
  you let go. The HUD's map can't serve here: it spins with the camera
  and follows the player, which is right for wayfinding and wrong for
  layout.
- The draw-call guardrail counts the WORLD, not the tool. Naively it
  read the renderer's total, which includes one handle per placement —
  the warning was measuring the editor. It now subtracts the handles
  actually inside the camera frustum, which lands within a call of the
  truth, and the panel says `~` rather than pretending to be exact.
- The store lives in `scene/`, not `editor/`. It is data the world
  needs; only the UI is dev-only, and keeping them apart is what lets
  the bundle check assert on the filename as well as the contents.

## 20 · Reasons to walk, and a world that notices {#reasons-to-walk}

**Hook:** The sand keeps your footprints, and a sign at the top of the
world tells you how far everything is.

**Plain:** Walk the beach and you leave prints behind you, pressed in
step with your feet, fading back into the sand after a few seconds.
It's a small thing and it changes how the island feels: the world
registers that you were there.

Near where you arrive stands a totem of a signpost, a carved hawk with
its wings spread at the top and six pointed boards stacked down a heavy
post, each one turned toward a landmark and
lettered with the real distance — the dock 68 m one way, the campfire
71 m another. Every board is an arrow, pointing where you'd walk. Both
numbers come from the same file the world is built from, so the sign
can't be wrong: move the campfire and its plank swings round and
re-letters itself.

**Technical:** Footprints are a fixed pool of 28 instanced ovals pressed
by the avatar's foot-plant — the same event that fires the footstep
sound, so the trail lands in step with the gait rather than on a timer.
They are built in world space at the moment of the step and converted to
planet-local, so they stay on the ground as the world turns under you.
They fade by lerping their instance colour back toward the sand rather
than by opacity: an opaque instanced mesh needs no transparency sorting
against the water or the fire, and per-instance alpha isn't a thing.
Sand only — grass springs back and a print in the sea is nonsense.

The signpost is a placement like anything else, so it can be dragged in
the editor. `bearingBetween` gives each plank its yaw from the local
tangent frame and `metresBetween` the great-circle distance. Each board
is an extruded arrow shape whose UVs are recomputed from the shape's own
coordinates — including a mirrored `u` on the back face, so a sign you
walk past reads correctly from both sides. The lettering is one canvas,
a row per plank at the plank's own aspect ratio so type never stretches,
with the font shrunk to fit if a name would run into the point. One
texture, one draw call. It rebuilds when the post or any landmark it
names moves.

**Files:**
- `src/scene/Footprints.tsx` — the pool and the press
- `src/scene/Avatar.tsx` — `aidenStep`, where a step becomes a print
- `src/scene/signpost.ts` — `buildSignpost`, `bearingBetween`, `metresBetween`

**Decisions:**
- Prints fade by COLOUR, not opacity. Transparency would have put 28
  more sorted surfaces in front of the water and the campfire, which is
  exactly the class of bug the fire's renderOrder rules exist to stop.
- The sign reads the world instead of quoting it. Hand-written
  distances would have been three lines of content and wrong the first
  time anything moved; deriving them means the sign is a view of the
  placement file, and a test pins both the maths and the fact that every
  named landmark exists.
- Aiming the boards took three goes, and the reason is worth writing
  down. `surfacePartMatrix` aligns local +Z with north, and in a
  right-handed frame with +Y up that puts EAST at local −X. Building the
  board along +X and turning it by the bearing pointed everything ninety
  degrees off; correcting that by a quarter turn fixed due north and
  left everything else MIRRORED — which looks plausible from the ground,
  because a fan of signs at wrong angles is still a fan of signs.
- The test that missed it was written from the same wrong idea as the
  code, so the two agreed with each other. The replacement takes no view
  on the frame at all: it pushes each board through the SAME
  `surfacePartMatrix` the scene uses and compares where the tip actually
  lands against the great-circle direction to the real placement — the
  point the editor's own grab handle sits on. Every board now aims
  within half a degree, and it fails if any of them lies.
- Props built by positioning each piece separately keep coming out as
  a pile of sticks — the mic stand's legs ended above its hub, the
  easel's legs never met anything. Both are now built from STRUTS
  BETWEEN TWO POINTS: name the feet and the apex, and let the geometry
  work out where each piece goes and which way it faces. Joints meet by
  construction rather than by eye, which is the only way this survives
  someone changing a dimension later.
- Sand only for prints, deliberately: leaving a trail across the whole
  island would turn a small delight into a permanent scribble, and
  grass genuinely does spring back.

## 21 · Tonight's moon {#telescope}

**Hook:** A telescope on the night beach shows the moon as it actually
is tonight — and it never phones anyone to find out.

**Plain:** Walk to the dark side of the island and there's a telescope
on a tripod — and it FOLLOWS THE MOON. The moon here isn't pinned to the
sky; it rises and sets depending on where you're standing, so a
telescope aimed at a fixed angle would spend most of its life pointing
at nothing. This one turns to keep the moon in its sights, slowly, and
settles back to a resting tilt when the moon is down. Look through it and you get the real
moon for today: its phase, how much of it is lit, how many days old it
is, and whether it's filling out or thinning, with the shadow drawn
across the disc where it really falls.

The obvious way to build that is to fetch a picture of the moon from
somewhere. This island doesn't do that. Nothing here calls out to
another server while you're visiting — that's why the fonts are stored
with the site and why analytics ships switched off — and a live image
would mean some other company seeing everyone who comes here, plus a
telescope that shows a broken picture the day that service changes.

It turns out you don't need to ask anyone. The moon's cycle is 29.53
days long and we know when one started, so today's phase is arithmetic,
accurate to within a few hours — far finer than an eye can read off a
disc. The picture in the eyepiece is Aiden's own photograph of the full moon,
with tonight's shadow laid across it. Under it is every number the
drawing is made from — how lit it is, how old, how far through the
cycle, which way it's heading, and when the next full and new moons
fall — with a dropdown that explains what each one actually means.

**Technical:** `moonPhase(date)` takes days since a known new moon
(2000-01-06 18:14 UTC) modulo the synodic month; illumination is
`(1 − cos 2πt)/2`, and the eight phase names take narrow bands around
the quarters so "first quarter" means roughly the day it is rather than
a whole week. `drawMoonPhase` paints the disc — the photograph if
`public/moon/moon.jpg` exists, else a procedural stand-in with maria —
then the shadow: a half-disc plus a terminator ellipse of horizontal
semi-axis `R·|cos 2πt|`, added for a crescent and carved out for a
gibbous. The shadow is dark blue rather than black because earthshine
keeps the unlit limb faintly present and a pure silhouette reads as a
hole in the image. The photo load is optional by construction: a
missing file falls back to the drawing instead of showing a broken img.

**Files:**
- `src/scene/moonPhase.ts` — `moonPhase`, `drawMoonPhase`, `SYNODIC_DAYS`
- `src/scene/Interactable.tsx` — `TelescopeBody`, the tracking
- `scripts/prepare-moon.mjs` — crops a photo to the moon's limb
- `src/ui/modals/TelescopeModal.tsx` — the eyepiece
- `src/scene/props.ts` — `buildTelescope`
- `src/scene/moonPhase.test.ts` — the almanac checks

**Decisions:**
- No API, deliberately. A live moon image was the first idea and it
  loses on every axis that matters here: privacy (a third party sees
  every visitor), reliability (endpoints move; NASA's own moon frames
  are re-pathed yearly), and the project's own rule that nothing phones
  home. Computing it is smaller, faster, offline, and exact enough.
- Pinned against real dates rather than only against itself: the full
  moon of 26 May 2021 and the new moon a fortnight earlier both fall
  where the maths says they should. A test that only checks internal
  consistency would pass with the epoch wrong by a week.
- The tube aims from WHERE IT STANDS, not from the planet's centre. The
  moon sits on a dome of radius 240 around a world of radius 55, so a
  surface observer sees it up to 13° off its centre-of-planet direction
  — the difference between a telescope pointing at the horizon and one
  pointing at the sky above it. The first version used the raw direction
  and stood there aiming at the zenith.
- The disc said when it was a stand-in, and named the file to drop in —
  which is how it got replaced within the hour. An unlabelled
  procedural moon would quietly have become the finished thing.
- The photograph is cropped to the limb by script, not by hand. The
  drawing clips the disc to a circle and lays an ellipse across it, so
  a photo with sky around the moon would show a black ring inside the
  eyepiece and a shadow that missed. `prepare-moon.mjs` finds the disc
  by luminance, squares the crop on its centre, and scales it — rerun
  it on any future photo and the maths still lines up.

## 22 · Wind: the palms sway {#palm-sway}

**Hook:** Every palm on the island leans in the same wind, and no two
ever move together.

**Plain:** Stand still and watch the trees — each crown of fronds and
coconuts breathes in a slow lean, with a quicker flutter riding on top,
the way real palm crowns shiver in a gust while the trunk barely moves.
Every palm answers to the same wind (the same one that drags the
clouds across the sky and drifts the campfire's smoke), but each one is
a beat out of step with its neighbors, so a row of palms never sways
like a chorus line.

**Technical:** `wind.ts` is the one wind: a fixed planet-local axis
(moved here from the clouds, which now import it instead of owning it)
and a pure `windLean(t, phase)` — a slow breathing sine plus a faster
two-tone flutter, tuned to a few degrees so a palm never reads as
blown over. `buildPalm` tags its frond and coconut parts (not the
trunk) with a `sway.pivot` — the crown's own prop-local point — so
`PropPart` carries an optional sway field through the merge pipeline
unchanged (three parts, same tris, same materials).

The hard part is that "downwind" means something different at every
placement: the wind is one fixed direction, but each palm sits on the
sphere at its own tilt. `SwayInstances` (instancing.tsx) solves this
once per instance at mount, not per frame: it reads the placement
matrix's own translation to get the instance's planet-local position,
asks `windDirAt` for the tangent wind direction there, then pulls that
world direction back into the prop's own local frame through the
INVERSE of the placement's rotation. Crossing local up with that local
wind gives the one axis that leans the crown toward it. A per-instance
phase (`i * 2.399`, an irrational-ish stride) keeps the pool from
breathing in unison. Every frame, `swayMatrix` composes `placement ×
T(pivot) × R(axis, angle) × T(−pivot)` — the pivot point itself never
moves, only the crown swinging around it — writing straight into the
instance matrix with module-level scratch only, so a windy island costs
zero allocations per frame. `InstancedProp` picks `SwayInstances` for
any part tagged `sway` and `StaticInstances` for the rest, so nothing
else that renders a prop had to change.

**Groove pass:** The owner watched it and said the leaves only shivered
on top — he wanted the trunk to sway left and right and bounce up and
down, "in a groovy hip-hop kind of way." So the whole tree learned to
dance. `GROOVE` in wind.ts gives the island a tempo (92 BPM) and four
pure functions on top of the wind: `grooveLean` swings the trunk ±0.07
rad once every TWO beats — a head nod, not a twitch — about the local
wind DIRECTION, which is left-and-right ACROSS the wind rather than
along it; `grooveCrownLean` gives the crown another ±0.09 rad on the
same nod but 0.6 rad behind it, so the fronds whip after the trunk has
already moved; `grooveBounce` stretches the tree vertically by
`1 + 0.045·max(0, sin(beat))²` — a pop on the beat and rest between,
never below 1, so a palm can never squat into the ground —
`grooveSquash` thins x/z by up to 1.5% at full stretch for the cartoon
volume cue; and `grooveBpm` hands each palm a tempo ±4% off the island's
so a grove drifts in and out of sync instead of marching.

Doing all of that at once needed more than one hinge, so `swayMatrix`
became the single-link case of a new `swayMatrixChain(placement,
links, out)`, where each link is `{ pivot, axis, angle }` and earlier
links are OUTER — they carry every later link's pivot with them, which
is exactly what makes a crown follow a leaning trunk. A palm's chain is
four links: trunk-wind and trunk-groove hinged at the BASE (0,0,0), then
crown-wind and crown-groove hinged at the crown point. `palmSwayMatrix`
composes it as `placement × chain × S(c, s, c)` — the bounce scale is
the INNERMOST transform, so the geometry squashes and stretches about
its base first and is then rotated rigidly (scaling last would shear a
leaning trunk instead of stretching it). Because the hinges act on
already-scaled geometry, the crown pivot is expressed in the scaled
frame as `pivot · (c, s, c)`; that one detail is what keeps the crown
welded to the trunk top while the tree rises on the beat, and it is
pinned by a test that walks 120 instants and asserts the same prop-local
point lands identically under the trunk matrix and the crown matrix.
`buildPalm` now tags the trunk part as a sway part too (with no
`crownPivot` — trunk links only, so its base stays planted), so all
three palm parts run through `SwayInstances`: still three instanced draw
calls for every palm on the island, still zero allocations per frame.

**Files:**
- `src/scene/wind.ts` — `WIND_AXIS`, `WIND`, `windDirAt`, `windLean`, `GROOVE`, `grooveLean`, `grooveCrownLean`, `grooveBounce`, `grooveSquash`, `grooveBpm`
- `src/scene/props.ts` — `buildPalm`, `PropPart.sway`
- `src/scene/instancing.tsx` — `swayMatrix`, `swayMatrixChain`, `solveSwayDatum`, `palmSwayMatrix`, `SwayInstances`, `InstancedProp`
- `src/scene/wind.test.ts` — the pivot-fixed, planted-base, crown-welded and downwind-lean pins

**Decisions:**
- The sway axis is solved once at mount, not recomputed every frame.
  The placement's rotation doesn't change frame to frame (only the
  editor's drag does, and that already rebuilds the instance list), so
  paying for the inverse-quaternion and cross product per frame per
  palm would be work with no visible payoff.
- The trunk was left out of the sway on purpose — and the groove pass
  REVERSED that call. The original reading was right about the failure
  (a whole tree swaying on the wind reads like the ground moving) but
  wrong about the cause: what made it read as ground movement was the
  trunk lean being on the SAME axis as the crown's, so the whole
  silhouette tipped as one rigid stick. Putting the trunk's groove on
  the wind DIRECTION axis (left-right across the wind) while the wind
  lean stays on the perpendicular, and lagging the crown behind the
  trunk, gives the two ends of the tree different motion — which reads
  as a tree dancing rather than the camera tilting.
- The bounce is a squared HALF-wave (`max(0, sin)²`), not a plain sine.
  A sine bounces a palm below its rest height for half of every beat,
  which either buries the base or forces a lift to compensate; the
  half-wave only ever stretches upward, so the base can stay exactly
  where `groundAltitudeAt` put it (placement rule 1 survives untouched)
  and the squaring sharpens the pop so it lands ON the beat instead of
  smearing across it.
- Per-palm BPM jitter (±4%) was worth more than more amplitude. The
  first pass ran every palm at exactly 92 BPM and, phase offsets
  notwithstanding, a grove at one tempo still reads as choreography —
  the palms hold their relative positions forever. Detuning each tree a
  few percent means the pattern never repeats, which is what sells
  "chill" over "synchronised".
- `WIND_AXIS` moved out of Clouds.tsx into its own module rather than
  being duplicated. The fire's ember drift already depended on the
  clouds' constant by import — three consumers of one "the wind" is
  the point where it stops being a clouds implementation detail and
  becomes shared physics.
- The formula's gust term can dip a hair negative at its extreme (a
  fraction of a degree) even though the design intent is "always
  downwind" — the two sine terms aren't phase-locked, so a rare instant
  can catch the base breath at its trough and the flutter at its
  trough together. Left as specified rather than clamped: the dip is
  small enough that it reads as stillness, not a wrong-way lean, and
  clamping would have been an undocumented change to a spec that says
  implement exactly.

## 23 · Villagers, and coats to put them in {#villagers}

**Hook:** Two people in fur-lined parkas, built for a corner of the
island that is still being dug out — and a villager you can now hand to
any empty patch of ground.

**Plain:** There is going to be an outpost at the bottom of the world,
and nobody lives there yet. So this step made the residents first: Nanuq
in a lagoon-blue parka and Sila in coral, both with cream fur at the
hem, the cuffs and around the hood, mittens instead of bare hands, and
tall boots. They are the same little villagers as everyone else on this
island — same body, same face, same walk — wearing a coat.

That mattered more than it sounds. Every character here is one rig with
a page of settings, and a parka is a real test of whether that claim
holds up. It does: the coat is a handful of extra settings, not a second
character. The torso is the same teardrop, padded out about a tenth. The
sleeves are the same arms, coloured all the way down. The hood is a
rounded cap over the back of the head with a ring of fur standing proud
around the face — and when the hood is up, the hair and the ears simply
do not get drawn, because they are under it.

Alongside the coats came the thing that actually makes a villager a
villager: something to do. Nanuq wanders. He stands for a few seconds,
picks somewhere within a few metres, ambles over, and stands again —
the unhurried loop Animal Crossing villagers have always walked. He
will not paddle into the sea, and he will not wander off; there is an
invisible leash around where he was placed. Sila stays put. Both of
them turn their heads to watch you when you come near, and stop
bothering once you are far enough away.

Nobody is standing anywhere yet — the outpost's land does not exist.
When it does, putting a villager on it is one line in the placement
file.

**Technical:** `CharacterConfig.outfit` gains `'parka'`, plus optional
`colors.trim`, `colors.mittens` and a `hood` flag. Inside `buildNodes`
the coat is a single `fullness` multiplier of 1.12 on the hip, shoulder
and collar radii — which is exactly 1 for every existing config, so the
tee-shorts and dress builds come out byte-identical and the old rig test
passes untouched. The fur hem is a short ring sitting a little wider
than the teardrop's widest point, the same radial-clearance trick the
tee hem uses so nothing goes coplanar; the placket reads its chest
z-offset off the same lathe profile the torso is built from. Boots are
the existing shoe blob at 1.4× height with the lift derived from that
scale, so the soles still kiss rig-local y = 0 and the blob shadow
contract holds.

`npcWander.ts` is the brain, and it is pure: `pickWanderTarget` samples
up to twelve points in the home disc (`sqrt` of the random radius, so
they spread evenly instead of clustering at the centre) and keeps the
first walkable one; `advanceNpc` runs a pause/walk state machine,
heading being the honest north/east bearing to the target. Arc distance
is metres throughout, converted with π·R/180 and a `cos(lat)` squeeze on
longitude.

`Npc.tsx` is the body. It reads its placement live from the placement
store, so the editor can drag it, and writes its group's position and
quaternion directly every frame — no React render per step, no
allocation in the loop. Altitude is `groundAltitudeAt` exactly, with no
sink: props bite into the ground on purpose, people do not.

**Files:**
- `src/scene/npcWander.ts` — `pickWanderTarget`, `advanceNpc`, `NpcState`
- `src/scene/Npc.tsx` — the component, `NpcBehavior`, the look-at maths
- `src/scene/npcRegistry.ts` — `NPC_REGISTRY`, placement type → villager
- `src/scene/BlockyCharacter.tsx` — `buildNodes`, the parka branch
- `src/content/characters.ts` — `NANUQ`, `SILA`
- `src/scene/npcWander.test.ts` — the leash, the arrival, the coastline
- `src/scene/characterRig.test.ts` — parka budgets and grounded soles

**Decisions:**
- The coat is a FLAG on the existing rig, never a second rig. The test
  that the old models still build identically is the whole point: a
  fullness factor that multiplies by exactly 1.0 for everyone else
  cannot regress a character it was not written for.
- The walkable test gates the STEP, not just the target. Two points can
  both be on dry land with water between them — a curved coastline does
  this constantly — and a villager wading out to sea on a straight line
  between two safe spots is the bug everybody would have seen first.
- The head look-at is computed by pushing the player's position through
  the villager's OWN quaternion rather than by hand-rolling a bearing in
  the tangent frame. The tangent version is two lines shorter and has a
  sign in it, and the signpost chapter is a standing record of what a
  sign in this frame costs: `atan2(x, z)` in rig space is what the rig
  already expects, so it cannot be inverted and leave a villager
  politely turning its back on you.
- Headings here are true north/east bearings and the renderer negates
  them. This frame turns local +Z toward WEST for a positive rotation
  about +Y, which is why the authored `yawDeg` is negated on the way in
  too — a villager has to spawn facing the same way a prop with that
  same yaw would, or laying out a scene becomes guesswork.
- The wander is seeded off the placement id, so a given villager always
  walks the same route. A random seed makes a wandering bug reproducible
  only by luck, which is another way of saying not reproducible.
- Nobody is placed yet, deliberately. The land is another task's job,
  and a villager standing in the sea while waiting for it would have
  shipped on `main` for however long that took.
- Footsteps and head-tracking both have a range gate (10 m and 9 m).
  Villagers audible across the island would turn the soundscape to
  gravel, and a head that tracks you from forty metres reads as being
  stared at rather than noticed.

## 24 · Antarctica {#antarctica}

**Hook:** There is a second place on this planet, and it is on the other
side of the world, under a sky where the sun never comes up.

**Plain:** Walk south from the island — past the sand, past the
waterline, out across the open ocean — and the light goes with you. The
sun sinks into the sea behind your shoulder, the water turns from warm
lagoon green to something colder and darker, and the stars come out.
Keep going and the far edge of the world stops being water: an ice
shelf, then a long white plateau running all the way to the bottom of
the planet.

This is Antarctica, and it is a real place you can stand on. It has its
own shoreline, its own snow, and its own little wooden dock reaching out
into the black water — pointing north, back the way you came, waiting
for a boat that doesn't exist yet.

The sky here doesn't cycle. Antarctica lives in permanent polar night:
no sunset side, no moonrise, just stars over a white plain and a horizon
the colour of deep steel. That isn't a trick with a slider. The sun and
the moon are still exactly where they always are, hanging over the
island — you have simply walked far enough around the sphere that the
ocean's own curve now stands between you and both of them.

**Technical:** The island's ground has always been one analytic
function: `terrainProfile(polar)`, a chain of smoothsteps from the grass
plateau down to an apron that ends tucked under the ocean floor. It
covered polar 0° to 90°. It now covers 0° to 180°. Past the equator it
evaluates a second set of control points — `SOUTH` in `planetConfig` —
at the distance from the SOUTH pole, with the identical shape: snow
plateau, shoulder, ice-shelf ramp crossing exactly zero at the
waterline, apron down to the same −0.9 m floor. Between the two aprons
(81° to 153°) the profile is that flat floor, which is why neither cap
shows a rim: both edges finish half a metre inside the ocean-floor
sphere. One function still feeds the terrain mesh, the walk controller,
prop placement and the water shader's depth, so they cannot disagree
about where the ground is on either landmass.

The island clamp became landmass-aware. `stepLeavesLandmass(before,
after)` asks which cap you are standing on, measures both angles from
THAT cap's own pole, and cancels the step only when it takes you further
out than the wade limit AND further than you already were — so walking
back in is always legal, in either hemisphere. Dropped mid-ocean you
simply keep walking toward whichever pole you were already heading for.

Polar night is one number. `southMix` is a smoothstep on the player's
polar angle, 0 at 95° and 1 at 125° — it ramps in out on the open ocean,
long before the ice. It takes the maximum with the existing `nightMix`,
so the whole rig (fog, background, hemisphere pair, ambient, stars,
emissives) crossfades to night with no second code path. It also blends
both disc solves toward `DISC_POLAR_MIN_DEG`, the home-side clamp: from
the south cap the arc to either body is over 95°, the visible-disc
fraction computes to zero, and the sea occludes them physically —
nothing is masked. The glitter lanes die with their bodies, because
submergence was already their only kill.

One thing polar night breaks is the key light. At night the directional
light follows the moon's world direction, and in the south the moon is
under the horizon — which would light the world FROM BELOW, the one
thing the lighting rules forbid. So the light direction eases by
`southMix` toward a fixed planet-local direction near the south pole,
rotated into world space with a scratch vector each frame.

**Files:**
- `src/scene/planetConfig.ts` — `SOUTH`, `SOUTH_DOCK`, `terrainProfile`, `landmassAt`, `maxWadePolarRad`, `stepLeavesLandmass`, `surfShoreWeight`
- `src/controls/terrain.ts` — `onDockStrip`, `dockStripAt`, `groundAltitudeAt`
- `src/scene/Island.tsx` — `buildDockGeometry`, the south cap
- `src/scene/useSkyState.ts` — `southMixFromPolarDeg`, `skyRuntime`
- `src/scene/Water.tsx` — `profileAlt`, the cold tint
- `src/scene/CelestialDome.tsx` — `buildStars`
- `src/ui/Minimap.tsx` — the south cap disc
- `src/controls/groundHeight.test.ts` — the south profile and clamp checks

**Decisions:**
- Antarctica is the SAME function, not a second one. The first sketch
  was a separate `southTerrainProfile` with its own caller — and the
  moment there are two ground functions there are two answers to "how
  high is the ground here", which is the exact bug placement rule 4
  exists to prevent. Mirroring inside the one function meant the water
  shader's depth port, the walk controller, the minimap and the editor
  guardrail all crossed the equator for free.
- The editor's "you placed this in the sea" warning used to be a
  LATITUDE threshold (`lat < 15`). A latitude only ever knew about one
  island: it called the dock's own camera tripod drowned while having no
  opinion at all about the entire southern hemisphere. It now asks
  `groundAltitudeAt(lat, long) > 0` — which is what "on land" actually
  means, on either cap.
- The south cap's pole needed the spoke fade after all. The plan said to
  leave `poleFadeRad` off, since it exists for the spawn turf — and the
  first screenshot came back with a perfect radial starburst, the sphere
  fan's razor triangles turning the facet jitter into spokes. The fix
  generalised the fade to measure distance to the NEAREST pole, which is
  a no-op for a cap that only ever reaches 81°.
- Two dock meshes, not one merge. They share a material and merging
  would have been the usual draw-call shave, but they sit on opposite
  sides of a sphere and can never both be in frame — kept apart, each
  frustum-culls and the measured cost is identical.
- Reachability is deliberately unfinished. There is no boat yet, so
  Antarctica is only accessible through `?at=<lat>,<long>`, a dev/e2e
  teleport that routes through the SAME `controlsRuntime.poseOverride`
  the screenshot sweeps already use, rather than inventing a second way
  to move the player.

## 25 · The boat {#boat}

**Hook:** The dock finally goes somewhere.

**Plain:** There is a small wooden boat tied up at the end of the dock,
just past the camera tripod, riding the swell on the east side where Koa
isn't dangling his legs. Walk out to the end and it says **E — Board the
boat**.

Step in and you are sitting on the bench with the water right there at
your elbow. Now push forward. The bow swings around, the hull gathers
speed, and the island starts sliding away behind you — sand, then the
shallows, then nothing but open water in every direction. Look back and
there is a line of foam on the sea marking exactly where you have been.

Keep going south and the light leaves. The sun drops into the water
astern, the sea turns from lagoon green to something much colder, the
stars come out, and after about eight seconds of open ocean a white edge
appears ahead: Antarctica's ice shelf, with its own little dock reaching
out to meet you. Pull alongside and the prompt changes to **E — Tie
up**. Press it and you step out onto the deck at the bottom of the
world.

The boat stays where you left it. Walk the ice, come back, and it is
still tied to the southern dock — which means the way home is to get
back in and drive north.

And you can just stand in it. Walk off the end of the dock and you step
down onto the boat's floor instead of through it — it is a surface like
the deck is, hollow wood underfoot, rocking very slightly on the swell.
Step off the side and you are back in the shallows.

**Technical:** The boat never moves. Nothing in this world does except
the world: driving is the SAME `rotationStep`/`applyStep` composition
the walk uses, stepped along the boat's own heading rather than the raw
input, so the hull carries its momentum through a turn instead of
sliding sideways with the stick.

Everything about where the boat lives is DERIVED. There is no boat row
in `placements.json` and no editor handle for it, because a mooring is a
property of a dock: `mooringUnit(dock)` takes the far-end plank
segment's centre latitude, steps `BOAT.mooringSideM` (1.7 m) sideways in
the same `surfacePartMatrix` frame the planks themselves are placed
with, and normalises. Move a dock and the boat moves with it. That frame
is worth a note — `surfacePartMatrix` builds +Y up and +Z north, which
makes local +X **west**, and Koa sits on the north dock's west edge with
his legs over the surf. The boat moors at local −x.

`advanceBoat` is pure and lives in `scene/boat.ts` with the geometry:
the heading eases toward the requested yaw the short way round at
`turnRateRadPerS`, the speed climbs toward `maxSpeedMps × mag` at
`accelMps2` and falls to zero at `decelMps2` when you let go, and it
returns the arc angle to travel this frame. `boatStepBlocked` replaces
the walk's landmass clamp: it cancels a step that carries the boat
inside either waterline plus `shoreMarginM` AND closer than it already
was, so a boat nudged onto a shoal can always reverse off. The prop
blocker list shrinks to every plank centre of both docks at
`halfWidthM + 0.9` — you cannot drive through a pier, and nothing on
land is reachable anyway.

Boarding and tying up are the sit tween's twins: a quaternion delta
`setFromUnitVectors(worldMooringDir → pole)` premultiplied onto the live
orientation and slerped over `BOAT.tweenS` with a smoothstep. A tween,
never a step, so blockers do not apply — which is the only way the
mooring is reachable at all, since it sits 1.7 m inside the far plank's
own 1.9 m blocker. Leaving is free, because blockers only ever cancel
steps that move you CLOSER. Tying up runs the tween twice: leg one
carries the mooring under the pole (the boat is now exactly where it
belongs), leg two carries the dock end under the pole (the player is now
standing on the deck).

The hull is drawn twice from one geometry. Moored it is planet-local,
bobbing on the live `surfOffset` beside its dock. Driving it is
world-fixed at `(0, PLANET_RADIUS + bob, 0)` outside the planet group, a
sibling of the avatar, rolling and pitching on two slow sines. The
hand-off happens on the tween boundaries — the one moment the two poses
coincide — so it never visibly jumps. The wake is 24 pooled instanced
discs stamped every 0.25 s at the pole's PLANET-LOCAL direction, so each
puff of foam stays on the water you left it on while the ocean turns
beneath you; they fade by lerping their instance colour toward the sea,
the same trick the footprints use in the sand.

**Standing in it.** The moored hull is a walkable surface, and it is
ANALYTIC — exactly like the dock strip, for exactly the same reason:
feet, prop altitudes and the audio all read one pure function of (lat,
long), so nothing can disagree with the thing you can see.
`onBoatDeck(lat, long)` in `controls/terrain.ts` is a rectangle test —
`BOAT.hullLengthM` x `BOAT.hullWidthM` centred on the current mooring,
its long axis along the mooring's meridian, measured in metres in the
local tangent frame with the same `mPerDegLat` / `cos(lat)` scaling
`onStrip` uses. It runs every frame out of `groundHeightAt`, so it
allocates nothing: both mooring lat/longs are derived once at module
load (`MOORING_LATLONG`), and the store PUSHES which mooring is occupied
into `setMooredBoat` on every change rather than terrain reading a React
store per frame. While you are boarding, driving or tying up the answer
is null — the hull is at the pole under you then, not out on the water.

`groundAltitudeAt` gains one line for it: `max(band, 0) + BOAT_DECK_M`.
The band is floored at zero because the boat floats on the SEA, not on
the seabed under it — so from the dock's end you step DOWN onto the
floor (deck 0.6 above the band versus the boat's 0.24 above the water)
and from the shallows you step UP out of the water, and the `wet` test
goes false on its own because the floor stands clear of the live
waterline. `surfaceUnderfoot` answers `'dock'` there: hollow wood, no
new audio category.

The hull itself had to float higher to make any of that safe. The
water's maximum live height is 0.18 m — three wave sines at 0.04 plus
the 0.06 surf swing — so the interior floor's top sits at
`BOAT_DECK_M` 0.24, above it, and the slab under that floor runs solid
down to the hull bottom at −0.30 (below the waterline, so the boat still
sits IN the sea) with a tapered nose piece sealing the bow triangle.
There is no longer any path for a wave to show through the floor.
`BOAT_DECK_M` and `BOAT_SEAT_M` live in `planetConfig` and are the only
source for all three consumers: the geometry `buildBoat` cuts, the seat
height the controller parks the driver at, and the height terrain walks
on.

One thing the boat broke immediately was the camera. The follow camera
floors itself against `groundHeightAt` under its own footprint — and out
at sea that analytic ground is the SEABED, metres down, so any downward
pitch parked the camera underwater looking up at the hull. Afloat, the
floor becomes `max(groundHeightAt, PLANET_RADIUS + 0.35)`: the sea
surface is the ground when you are on it.

**Files:**
- `src/scene/boat.ts` — `mooringUnit`, `dockEndUnit`, `advanceBoat`, `boatStepBlocked`, `BOAT_BLOCKERS`, `MOORING_LATLONG`, `setMooredBoat`
- `src/controls/terrain.ts` — `onBoatDeck`, `groundAltitudeAt`
- `src/scene/planetConfig.ts` — `BOAT`, `BOAT_DECK_M`, `BOAT_SEAT_M`, `surfaceUnderfoot`
- `src/store/useStore.ts` — `BoatState`, `boardBoat`, `tieUp`
- `src/controls/usePlanetController.ts` — `controlsRuntime`, `BOAT_SEAT_M`
- `src/controls/usePointerLockCamera.ts` — the afloat camera floor, `CAM_GROUND_CLEAR`
- `src/scene/BoatScene.tsx` — `MooredBoat`, `DrivingBoat`, `BoatWake`
- `src/scene/props.ts` — `buildBoat`
- `src/ui/Hud.tsx` — `BoatPrompt`
- `src/scene/boat.test.ts` — the mooring and physics checks
- `e2e/boat.mjs` — the whole crossing, driven and screenshotted

**Decisions:**
- The mooring is derived, not placed. The obvious move was a placement
  row with a `blockerRadiusM` like every other prop, and it was wrong on
  two counts: a boat dragged in the editor would detach from the dock it
  belongs to, and its altitude would come from `groundAltitudeAt` minus
  the sink — which over water is the seabed, not the waterline. Deriving
  it from the dock's own segment matrix means the two can never disagree
  and the hull always sits at y = 0 = sea level.
- Stepping along the heading, not the input. The first pass reused the
  walk's step direction (the camera-relative move dir) verbatim, and the
  boat crabbed sideways the instant you turned the camera — a canoe that
  strafes. Input now only asks for a heading; the step always follows the
  bow.
- The boat's blocker list is a boat-only list. Running the full prop
  blocker set while driving does nothing useful (every palm and headstone
  is inland, unreachable from the water) and costs a loop over a hundred
  and fifty entries a frame. Two docks' plank centres is the whole hazard
  map out there.
- The moored deck is analytic, not a collider. There is no physics
  engine here and there never will be one, so "you can stand on the
  boat" had to be the same kind of answer the dock already gives: a pure
  function of (lat, long) that `groundAltitudeAt` consults. That buys
  the whole feature for one rectangle test — feet, the blob shadow, the
  camera floor, the wet test and the footstep pool all follow for free,
  because every one of them already reads that function.
- The hull floats higher than it used to. The owner's second complaint
  was water poking up through the floor, and the old hull invited it:
  the bottom slab was 0.16 m thick sitting ON the waterline, so its top
  was at 0.16 while the live sea reaches 0.18. Raising the floor to 0.24
  clears the water's maximum by 0.06, and thickening the slab down to
  −0.30 means there is no thin plate for a wave to cross at all. The
  above-water silhouette barely changed (gunwale 0.58 → 0.62); what
  changed is how much hull is under the sea.
- The analytic deck is the hull's MEAN height, and the mesh bobs past
  it. Pinning the walkable height to the live bob would mean terrain
  asking the clock, which no other band does. Instead the moored swing
  was halved (0.05 → 0.03, the surf term kept) so the residual float is
  a couple of centimetres and reads as a boat rocking under your feet.
- The seated rig's root is at its FEET, and parking it on the bench top
  floated the player a head above the thwart. The log seat had already
  solved this — root 0.30 against a 0.42 log top — so the boat borrows
  the same 0.12 m drop rather than inventing a second seat convention.
- Cream thwarts were a mistake. The first hull had the bench and the
  stern seat in the same cream as the gunwale trim, and from above it
  read as a rope ladder lying in the boat. Only the rail is cream now;
  the seats are planks, like seats.
- `Boat.tsx` could not exist. The physics lives in `scene/boat.ts` and
  TypeScript refuses a program containing both names on a
  case-insensitive filesystem, so the component is `BoatScene.tsx`.

## 26 · Antarctica comes alive {#antarctica-life}

**Hook:** Somebody lives down here. There is a light on in the igloo,
there are penguins on the ice, and the whole sky is green.

**Plain:** The south cap used to be a beautiful empty plain. Now it is
a place with residents.

There is an igloo on the plateau — a dome of stacked snow blocks with a
low entrance tunnel — and the tunnel glows. Sila stands outside it,
watching the door. Nanuq wanders a few metres of snow further out,
stopping and starting the way villagers do. Out toward the ice shelf a
colony of penguins waddles about: they walk, they stop, they turn, they
rock side to side with every step, and if you get within about two and a
half metres one of them panics and hop-shuffles straight away from you.
They never walk into the sea.

Overhead, the aurora australis. Three enormous curtains of green and
teal hang across the polar sky, rippling, brightening and dimming in
slow waves, fading to violet and then to nothing at the top. You can see
them from the open water on the way in — a green glow standing over the
horizon before the ice is even visible — and once you are standing on
the plateau they fill the sky above you.

And it snows. Not hard: a slow, quiet fall across the whole cap, drifting
sideways on the same wind that pushes the island's clouds.

**Technical:** Everything here obeys the two rules the rest of the world
obeys: no new shaders, and repeats are instanced.

The **aurora** is mesh animation, nothing else. One `InstancedMesh` of
108 thin quads on a shared `PlaneGeometry` whose vertex colours run
green at the foot, teal at the waist, violet at the head and black at the
top. The material blends additively, which means black IS transparent —
the curtains fade out at the top with no per-vertex alpha and no shader
of their own. The layout is pure and tested (`auroraLayout.ts`): three
paths sweeping 140–160° of longitude around the pole at a polar angle
that wobbles about 11–16°, each quad standing up along the surface
normal with its width along the path tangent. Per frame the animation
writes matrices and `instanceColor` from module scratch: a two-term
height wave stretches each quad, a small lean rocks it about its own
tangent, and a travelling brightness wave with a faster ripple on top
rides the instance colours. Nothing allocates.

The **snow** is the campfire's ember technique turned cold. One
`THREE.Points` of 500 flakes (220 on low tier) in a group anchored at the
south pole with local +y pointing outward, so the flakes live in a plain
26 m × 18 m cylinder and fall straight down. The position attribute is
allocated once and rewritten in place. Lateral drift is the ONE global
wind (`windDirAt`) brought into the pole's frame at mount, plus a gentle
per-flake sway. The floor a flake wraps at is the sphere's own drop away
from the pole's tangent plane plus the terrain profile, so flakes out
near the shelf land on the shelf instead of vanishing in mid-air.

The **penguins** are the crabs' southern cousins: six birds, eight box
parts each, all 48 instances in one `InstancedMesh` with per-part colours
written once through `instanceColor`. The walk itself is a pure kernel
(`penguinWalk.ts`) held in (polar-from-the-south-pole, longitude) rather
than latitude, because that is how the whole south cap is measured. Two
clamps run on every step, walking or paused: the band (8°–21.5° from the
pole) and the waterline (`groundAltitude > 0.05` — the shelf ramps to
zero before the band runs out, so the band alone is not enough). vitest
drives six birds for twenty thousand steps each and asserts both.

The **igloo** is a placement like everything else, so the editor can drag
it: one vertex-tinted merge (dome, three block courses cut to the wall at
their own heights, half-barrel tunnel, dark opening disc) in
`PROP_REGISTRY`. A small `<Igloo>` glue component reads that placement
live and hangs the warmth on it — a dim warm point light and a glowing
half-disc in the mouth, both positioned from `IGLOO_MOUTH`, the same
constants the geometry is cut from.

All three animated systems early-return and set `visible = false` when
`skyRuntime.southMix` says the player is nowhere near the cap, so from
the island they cost nothing at all. On the cap itself the whole scene
measures 49 draw calls, under the mobile budget of 50.

**Files:**
- `src/scene/props.ts` — `buildIgloo`, `buildIceblock`, `buildSnowmound`, `IGLOO_MOUTH`
- `src/scene/auroraLayout.ts` — `buildAuroraLayout`, `AURORA_QUAD_W`
- `src/scene/Aurora.tsx` — `Aurora`, `curtainGeometry`
- `src/scene/Snow.tsx` — `Snow`, `poleFrameFloor`
- `src/scene/penguinWalk.ts` — `advancePenguin`, `clampToBand`, `startlePenguin`
- `src/scene/Penguins.tsx` — `Penguins`
- `src/scene/Igloo.tsx` — `Igloo`
- `src/content/placements.json` — the igloo, Sila, Nanuq, four ice chunks, three drifts
- `src/scene/antarcticaLife.test.ts` — the band, waterline, dock-clearance and aurora-layout guards

**Decisions:**
- The aurora is ONE instanced mesh, not three. The design called for a
  mesh per curtain, and the first build did exactly that — but a curtain
  is fifty metres of sky, so its bounding sphere covers most of the cap
  and it never frustum-culls from a camera standing underneath it. Three
  meshes meant three draw calls, always, and the cap was sitting at 53.
  Merging them costs nothing visually (same geometry, same material, the
  curtain index just becomes a phase offset) and bought back the two
  calls the budget needed.
- The first curtains read as a folded paper chain. The quads were 2.1 m
  wide and the path's polar wobble ran at better than two cycles across
  the span, which pushed the along-path spacing past the quad width —
  black gaps between hard-edged parallelograms. Gentler wobble plus
  wider quads (they have to OVERLAP their neighbours) turned the
  instances into one sheet. Then 0.55 opacity washed the bright ridge to
  white under additive stacking, so the material sits at 0.4.
- The igloo's warm light belongs INSIDE the tunnel. Hung on the step,
  at a hand's width from the opening disc, it blew the disc out to a
  flat orange plate — a fire door, not a doorway. Behind the disc it
  lights only the tunnel walls and the snow the mouth spills onto, and
  the glow disc shrank to under half the opening so the dark hole is
  still a hole.
- The penguins' band clamp was not enough on its own. Polar 21.5° from
  the south pole is inside the shelf on paper, but the shelf ramp is
  already down to about 2 cm of altitude there — a penguin standing in
  the surf. The altitude clamp is the binding one and it runs even while
  a bird is paused, exactly as the crabs' live-waterline clamp does.
- Two villagers cost eighteen draw calls. `BlockyCharacter` is already
  merged down to eight meshes plus a blob shadow, which is the right
  shape for a player avatar and expensive for scenery — and placing the
  first NPCs in the world is what made that visible. It is why the
  aurora had to give two calls back, and it is the number to watch if
  the cap ever gets a third resident.
- The yaw in the brief did not survive contact with the frame. The igloo
  was specced at yawDeg 200 "entrance roughly toward the dock side", but
  in this codebase a positive yaw swings local +z toward WEST (signpost
  and villagers both found the same sign the hard way), so 200 pointed
  the tunnel at empty plateau. 45 is what actually faces the dock and
  the walk-in.
