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

- Structure: root group → body (drei `RoundedBoxGeometry`) → head group
  (oversized rounded box + low-segment sphere eyes, e.g.
  `SphereGeometry(r, 12, 8)`) → one pivot group per limb.
- **The pivot trick** (three.js has no transform-origin): create a group AT the
  shoulder/hip, offset the limb mesh downward by half its length inside it,
  rotate the group. All limb animation happens on these pivot groups.
- Mii design language (documented): oversized round head carries identity;
  simple flat face (dot eyes); matte plastic skin; stubby body ~2 heads tall;
  no fingers. Kokeshi dolls are the mental model.
- Parameterize everything (head size, limb length, colors, hair shape,
  accessory) — the rig is data-driven from `src/content/characters.ts`.
- Budget: ≤ ~3k triangles per character.

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
