# Style playbook — cozy chibi low-poly, proven techniques

Read this before any character, terrain, cloud, or lighting work. It distills
external research (Codrops tutorials, shipped cozy web games, shader
reverse-engineering) into the techniques this project uses. CLAUDE.md holds the
decisions; this file holds the recipes and the evidence links. Techniques here
are proven in shipped three.js work — do not re-derive alternatives.

## 1. Chibi character rig (primitives + nested groups)

Canonical references: Codrops "Creating 3D Characters in Three.js" (Barker,
2021) and "The Aviator" (Maaloul, 2016). Cute flat-shaded characters built
entirely from primitives are an established art direction, not a shortcut.

- **The pivot trick** (three.js has no transform-origin): create a group AT the
  shoulder/hip, offset the limb mesh downward by half its length inside it,
  rotate the group. All limb animation happens on these pivot groups.
- Mii design language (documented): oversized round head carries identity;
  simple flat face; matte plastic skin; stubby body ~2 heads tall;
  no fingers. Kokeshi dolls are the mental model.
- Parameterize everything (head size, limb length, colors, hair shape,
  accessory) — the rig is data-driven from `src/content/characters.ts`.
- Budget: ≤ ~3k triangles per character.

### Character 2.0 — the ROUNDED villager recipe (v3.15, binding)

The blocky-box rig is superseded. Characters are rounded AC-villager
volumes, all still stock three.js primitives, merged per rigid node:

- **Head**: flattened sphere — `SphereGeometry(r, 16, 12)` scaled
  `(1, ~0.9, ~0.95)`, oversized (head ≈ height / headsTall, the charm
  carrier). Local origin stays at the neck.
- **Hair = SOLID volumes, never open shells** (open shells backface-cull
  into see-through from below): a cap sphere slightly larger than the
  skull, squashed and nudged up-back for the helmet read; fringes are
  smaller squashed spheres laid across the forehead ('swoop' = one wedge
  rotated ~-0.25 z sweeping to a side; 'bob' = wider cap that drops past
  the ears + a straight full-width fringe).
- **Face**: eyes = big vertical-oval flattened dark spheres
  (`scale(1, ~1.6, 0.45)`) each with a tiny white highlight sphere
  offset up-outward; mouth = micro torus arc (partial `TorusGeometry`,
  smile opens upward); a tiny rounded NOSE just above the mouth (soft
  peach blob, `noseStyle` param); PERKY round monkey-ears at the
  head's midline or slightly above (`earY`), tilted outward-upward
  ~10–15° (`earTilt`), protruding past the hair cap so they read from
  the front AND the back, matched sides; optional blush = flattened
  pink discs on the cheeks (config flag).
- **Eyes come in two styles (`eyeStyle`)**. 'dark' (v3.19): a dark
  rounded oval (near-black warm brown) with ONE white catchlight in
  the upper corner — the AC villager read. 'normal' (v3.20, the
  Raymond target): LAYERED stacked flattened discs with small
  z-offsets — subtle dark outline → white oval base → soft blue IRIS
  ring (`irisColor`, ~#5B8FE3) → dark pupil → one white catchlight,
  upper corner → a skin-tone UPPER EYELID disc flat-topping the eye
  (`lidHeight`, ~28% covered — the relaxed AC read; the catchlight
  stays below the lid line). The outline keeps the white from
  dissolving into the skin; the layers must read as friendly blue eyes
  at gameplay distance (verify at distance, not close-up). If z-offsets shimmer,
  fall back to a tiny GENERATED canvas eye texture on a disc (§3
  caveat — never a downloaded image).
- **Glasses (`glassesStyle`)**: 'bold-rect' (v3.20, Raymond) = bold
  rounded-rectangle rims built from chunky charcoal boxes, visibly
  thick, the bridge spanning the rims at their CENTER height (taste
  call — never drooping at the rim bottoms), lenses open (both eyes
  fully visible inside), short temple arms running back to the ears; scaled
  so the rims frame the eyes without touching hair or smile. 'round'
  (v3.19) = thin dark tori hugging the face sphere's curve, bridge
  seated on the nose (`glassesSeat`). Never fill a lens with opaque
  color.
- **Tee, not tank (v3.18)**: short sleeve caps in the top color hug
  the arm's top segment (skin starts below the sleeve) — SLIM (+~20%
  arm radius at most; the old fat sleeve built linebacker shoulders),
  emerging from under the torso curve so the shoulder silhouette stays
  the teardrop's. Rest pose (v3.19): arms angle ~45° down-and-out with
  clear daylight along the whole upper arm, ball hands ending outside
  the hip silhouette; swings compose on this base.
- **Hair reads as ONE mass**: fringe volumes overlap deep into the cap
  (a separated fringe reads as a glued-on lobe). The swoop = cap +
  side-swept fringe merged into one smooth silhouette.
- **Character Studio** (`?studio`, dev-only, code-split, zero new
  deps): orbit/zoom viewer + a plain-HTML panel binding LIVE to every
  `CharacterConfig` field (scales, sleeve, arm rest angle, limb
  thickness, torso profile fractions, palette) with pose buttons and
  clipboard config export — tuning happens there, never by rebuild
  guesswork.
- **Body = TEARDROP, never an egg-on-end** (v3.16 fix — the egg read
  widest at the shoulders): a `LatheGeometry` profile with narrow sloped
  shoulders (≈0.455× head width after the v3.20 −6% nudge; `waistSlim`
  pulls the mid-torso in further) widening in ONE unbroken convex curve
  to the hips (≈0.73× head width, depth squash ~0.78 — the body's widest point, near its
  base) and a rounded base ending in a TEE-HEM LIP: the hem extends
  below the widest point at full radius, and the shorts band beneath
  sits at a clearly SMALLER radius — real radial clearance, never
  coplanar surfaces at the waist (the poking waistband line). **Watertight + outward
  normals (v3.17)**: the profile must start AND end on the axis so the
  lathe caps itself, and must run BOTTOM→TOP — a top→bottom profile
  winds the triangles inward, and the backface-culled hollow renders
  arms-through-the-torso from behind. Chibi proportions per the base
  reference: ~2 heads tall, head ≈50% of total height.
- **NO NECK (v3.18 taste call)**: the head sits DIRECTLY on the torso,
  AC-villager style — the skull's base embeds ~13% of head height into
  the collar, and the head pivots about its OWN CENTER (never a neck
  joint below it): a sphere rotating about its center is
  rotation-invariant, so the embed can never open a gap at any
  yaw/pitch. Verify at maximum COMPOUND deflection (±60° yaw with ±25°
  pitch) from a full orbit; deepen the embed if anything shows. The
  rig keeps `neckLength` (default 0) for characters that want a
  visible neck — the cylinder then lives in the HEAD node so it moves
  with the look-at.
- **Arms**: slim capsules whose mounts sink BENEATH the torso surface —
  the capsule top never crests above the shoulder slope; the shoulder
  silhouette is the torso's curve, arms emerging from under it. Rest
  pose is a true A-POSE (~25–30° out) with the ball hands clearly
  separated from the torso at hip height; walk/run swings COMPOSE on
  top of that base angle (never collapse back to pinned). NO fat
  sleeve capsule (it built linebacker shoulders).
- **Shorts are a GARMENT, not a blob**: a hip band (short cylinder
  seated at the teardrop's widest point) plus two separate leg cuffs on
  the upper thighs — cuffs live in the LEG nodes so they swing like
  fabric — with daylight between the cuffs at the inseam. Never a
  single rounded mass between the legs. A dress swaps band+cuffs for
  one flared cone skirt.
- **Legs**: skin-tone stubby capsules emerging from the cuffs, close
  together, ending in small rounded shoes (spheres scaled
  `(1, ~0.6, ~1.3)`, toe forward), soles kissing rig-local y = 0.
- **Shading exception (deliberate)**: characters use SMOOTH-shaded
  `MeshLambertMaterial` (`flatShading: false`) — matte-plastic AC/Mii
  toys on a flat-faceted world, as Animal Crossing itself does. The
  merge pipeline preserves smooth normals (`toNonIndexed()` copies the
  normal attribute; never call `computeVertexNormals` on character
  parts).
- Structure and everything else is unchanged: one merged vertex-colored
  geometry per rigid node (torso / head / arm / leg), one shared
  material, ~6 draw calls per character, pivot groups for animation.

## 2. Procedural animation (no skeletons, no AnimationMixer)

All animation is transform math on the pivot groups inside `useFrame`:

- Idle: `pos.y = base + sin(t * 2) * 0.05`, tiny arm sway.
- Walk: counter-phase limbs — `legL.rot.x = sin(t * f) * amp`,
  `legR = -legL`, arms opposite at ~0.6×.
- Run: higher frequency + amplitude + slight forward body lean.
- Jump (squash & stretch, volume-preserving): brief squash
  `scale(1.1, 0.85, 1.1)` but launch IMMEDIATELY (never delay input for
  anticipation — documented game-animation practice), stretch
  `(0.9, 1.2, 0.9)` on ascent, squash on land, ease back to 1.
- State machine = one `blend` per state; lerp amplitude/frequency toward the
  active state's targets (~0.15 s time constant). Never swap clips — there are
  no clips.
- Quality bar: the 12 principles (squash/stretch, follow-through, arcs,
  ease in/out) applied to transforms is what reads "alive" vs "robotic".

## 3. Terrain: per-face two-tone vertex colors (NOT textures)

The Animal Crossing grass is a two-tone triangular tiling (documented on
Nookipedia; AC:NH itself uses a texture + seasonal LUT per reverse-engineering
by Goated Games). Our adaptation, forced by the no-texture rule AND by
geometry: **a tiled UV texture distorts badly on sphere-cap pole-fan
triangles, so the pattern is painted as per-face vertex colors instead.**

- `geometry.toNonIndexed()` so each triangle owns its vertices, then write the
  SAME color to a triangle's three vertices → crisp per-face color, no
  bleeding (three.js forum-documented pattern).
- Material: `MeshLambertMaterial({ vertexColors: true, flatShading: true })`;
  `computeVertexNormals()` on non-indexed geometry yields flat face normals
  automatically.
- Grass: alternate/noise-weight two greens per face. Sand: irregular tan
  patches. Assign by face index + seeded noise, never by UV.
- Seeded jitter (mulberry32 or `MathUtils.seededRandom`) for the handmade
  facet look — deterministic so placements stay valid. Keep the existing
  pole-fade so jitter/tint don't spoke at the pole.
- Optional later: a tiny procedurally GENERATED canvas tile for the crisp
  regular motif on low-distortion flat patches only. Never a downloaded image.

## 4. Sky, clouds, lighting (cozy without postprocessing)

- Lighting recipe (Aviator pattern): `HemisphereLight(skyPastel, groundPastel)`
  + one soft `DirectionalLight` + gentle ambient. Brightness comes from light
  intensity and saturated-but-light palette colors — the AC "slightly
  overexposed" cozy look — never from bloom/postprocessing.
- Default material everywhere: `MeshLambertMaterial` (cheapest lit, matte
  plastic — the Mii finish). Approved experiment: `MeshToonMaterial` with a
  3-step `DataTexture` gradient map (procedural data, not an image) for
  stepped Nintendo shading. No Phong/Physical/specular anywhere.
- Clouds: hand-built clusters of 3–6 white rounded boxes in a group (Aviator
  pattern), instanced if numerous, slow drift in useFrame. Do NOT use drei
  `<Cloud>`/`<Clouds>` — it is billboard sprites requiring a cloud texture.
- Sky gradient: vertex-colored inward dome (already spec'd in 3B as the
  celestial dome: `fog: false`, `depthWrite: false`, rendered first).

## 5. Performance: draw calls are the budget, triangles are not

Documented guidance converges: GPUs eat triangles; scenes die by draw calls.
Targets: **< 50 draw calls on mobile, < 100 desktop** (check
`renderer.info.render.calls` / r3f-perf). Shipped proof this style flies:
Abeto's *Messenger* (cozy tiny-planet Three.js game, 2025) loads ~5.7 MB and
runs on 4-year-old Android phones with an ~81k-vertex world; Bruno Simon's
portfolio ships with no lights/shadows at all — blob-shadow "illusions" (which
validates our existing blob shadows).

- Instance every repeated prop (drei `<Instances>`; drop to raw
  `THREE.InstancedMesh` if drei's wrapper measures slower — a known issue).
- `BufferGeometryUtils.mergeGeometries` for static same-material clusters;
  one shared material per prop type.
- Zero allocations and zero React state updates inside `useFrame` — mutate
  refs, reuse scratch objects.
- `frameloop="demand"` is NOT applicable here — the world animates
  continuously (water, avatar, critters). Ignore that advice when it appears.
- Perf fix order when under budget: draw calls first → segment counts →
  shadows/effects last.

## Legacy-API hazard

Older tutorials (Aviator era) use `THREE.Geometry`, `Face3`,
`shading: THREE.FlatShading`, `THREE.VertexColors`, `.merge()` — all removed.
Translate to: `BufferGeometry`, `flatShading: true`, `vertexColors: true`,
`mergeGeometries`. Borrow their structure, never their API.

## Primary sources

- Characters: tympanus.net/codrops/2021/10/04/creating-3d-characters-in-three-js
- The Aviator: tympanus.net/codrops/2016/04/26/the-aviator-animating-basic-3d-scene-threejs (code: github.com/yakudoo/TheAviator)
- Low-poly terrain: medium.com/@joshmarinacci/low-poly-style-terrain-generation-8a017ab02e7b
- Per-face colors: discourse.threejs.org/t/how-to-color-individual-faces-of-a-boxgeometry-tononindexed-object-using-vertices/30099
- AC grass shader teardown: goated.games/2024/11/animal-crossing-seasonal-shader · nookipedia.com/wiki/Grass
- 12 principles in games: gameanim.com/2019/05/15/the-12-principles-of-animation-in-video-games
- Draw calls: threejsroadmap.com/blog/draw-calls-the-silent-killer · r3f scaling: r3f.docs.pmnd.rs/advanced/scaling-performance
- Shipped proof: messenger.abeto.co (+ webgpu.com/showcase/messenger) · Bruno Simon case study: awwwards.com/brunos-portfolio-case-study.html
- Mii design: miiwiki.org/wiki/Mii
