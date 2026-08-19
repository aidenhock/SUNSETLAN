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

Near where you arrive there's a signpost, its planks each turned toward
a landmark and lettered with the real distance — the dock 68 m one way,
the campfire 71 m another. Both numbers come from the same file the
world is built from, so the sign can't be wrong: move the campfire and
its plank swings round and re-letters itself.

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
tangent frame and `metresBetween` the great-circle distance; the
lettering is drawn into one canvas at build time, a row per plank, with
every plank's UVs mapped to its own row so the whole sign is one texture
and one draw call. It rebuilds when the post or any landmark it names
moves, keyed on those coordinates.

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
- Sand only for prints, deliberately: leaving a trail across the whole
  island would turn a small delight into a permanent scribble, and
  grass genuinely does spring back.
