# Session report — 2026-08-16 (unattended batch run)

Eight tasks, worked in order without stopping. Every task ended with a
green build, its build-log chapter, and its own commit; the tree was
never left dirty between tasks. Baseline for every number here is
commit `b22fe2a` (recorded in `sweep-shots/2026-08-16/BASELINE.md`).

## What shipped

| Task | Commit | What |
|---|---|---|
| 0 | `14bcb4d` | Preflight — baseline metrics recorded, a real e2e flake root-caused and fixed |
| 1 | `570ca67` | Build-log JSON gains build-time code excerpts (52 across 13 chapters) |
| 2 | `b7580c1` | Minimap HUD — compass projection, exploration fog, persistence |
| 3 | `5cd9c07` | Memorial garden at lat 47/107 — walled cemetery, quiet modal, night fireflies |
| 4 | `7682347` | Matrix glitch portal at lat 32/97 — code-split room rendering the build log |
| 5 | `0b32062` | Launch chores — self-hosted fonts, favicon set, manifest, canonical |
| 6 | this commit | Quality pass — budgets, mobile sweep, a11y, /classic parity |
| 7 | this commit | This report |

### The crab-snap flake (TASK 0)

Worth calling out because it was a real bug, not a flaky test. The
tab-return stall guard I added in an earlier session treated *any*
overdue snap timer as a missed event to skip — but for a
condition-gated timer (crab paused **and** player within 4 m) being
overdue is the normal case, so snapping became a 25%-per-frame
lottery. The guard now measures an inter-frame **clock jump**
(`t − lastT > 0.25`), which is what "the tab was hidden" actually looks
like. Verified green three times running.

### Memorial garden (TASK 3)

A stone wall ring with a northern gate, two headstone rows, a bench and
flowers — one vertex-tinted merge, one draw call. The front row is
interactable ("E — Remember"). At night the garden holds two dim warm
lights and a twelve-point firefly pool, both gated on `nightMix` and
quality tier; the brief said *never bright* and the peak intensities
(0.35 / 0.28, distance 4) are deliberately below the campfire's.
Blockers trace the **visible** wall and gate posts, leaving the interior
fully walkable — the moai lesson (invisible walls read as getting stuck
on nothing) applied from the start.

**Consent rule, recorded in `memorials.ts` and `CONTENT.md`:** names and
photos of living people need their explicit okay before shipping
publicly; pets are Aiden's call. Three placeholder stones ship, and the
modal says plainly that they are placeholders rather than pretending to
be real remembrances.

### The portal room (TASK 4)

The build log now renders itself in-world. A dark archway with a
flickering green pane stands past the terminator; stepping through
mounts the room **in the same canvas** — the planet group and avatar
flip to `visible={false}`, so the room's cost replaces the world's
instead of stacking on it. 13 draw calls, 732 triangles.

The rain uses no new shaders (the two-shader rule stands): a
procedurally generated canvas glyph atlas is sampled by tall quads whose
UVs are baked to one atlas column each, merged into three geometries
whose `map.offset.y` scrolls at three speeds. Chapter text and the code
excerpts come from `docs/build-log.json` — captured from the real source
files at build time — so the room cannot drift from the code it
describes. Both halves are lazy chunks; the initial payload is
unchanged.

### Fonts (TASK 5) — a decision I made

`CLAUDE.md` flagged this as a launch decision: the two typefaces were
declared in CSS but never loaded, so everything rendered `system-ui`.
I chose **self-hosting over a fonts CDN** because nothing else in this
project makes an external request at runtime, and logged it here rather
than waiting. `scripts/fetch-fonts.mjs` pulls the latin woff2 subsets
into `public/fonts/` and generates `src/fonts.css`. Bricolage is a
variable font, so the naive per-weight download shipped the same 75 KB
file twice — the script now dedupes by content and emits a weight range.
109 KB for all three files, `font-display: swap`, licenses in
`CREDITS.md` (both OFL).

## Budgets

All hold. Full table with deltas in `sweep-shots/2026-08-16/BUDGETS.md`.

- Draw calls: spawn **45** (−1), mid-dock **40** (0), night-beach **38**
  (+5, the garden and portal are both on that side), room **13** —
  against < 50 mobile / < 100 desktop.
- Triangles: worst vantage 42,424 against a 150k budget.
- Initial payload: **1.33 MB** against 8 MB. Fonts are the only addition
  to first load (~94 KB); the room and the build-log JSON are lazy.
- 60 fps at every vantage, quality tier high.

## Suites

vitest **101 passed** (was 90) · playwright **18 passed** across 5 specs
(was 15). New coverage: minimap math, the two new prop builders, the
memorial modal's placeholder copy, the portal round-trip *with* an
in-room draw-call assertion, and `Memorials` + `Build log` added to the
/classic section sweep so the mirror rule stays enforced.

## Screenshots

All in `sweep-shots/2026-08-16/`:

| File | What |
|---|---|
| `minimap.png` | The compass minimap with exploration fog |
| `cemetery-approach.png`, `cemetery-inside.png` | The garden by day |
| `cemetery-night.png` | Fireflies, glow, and the "E — Remember" prompt |
| `cemetery-modal.png`, `classic-memorials.png` | The memorial card, both surfaces |
| `matrix-portal-day.png`, `matrix-portal-night.png` | The archway; the pane glows after dark |
| `matrix-room.png`, `matrix-room-code.png` | The room, and a real code excerpt expanded |
| `classic-buildlog.png` | The same chapters on /classic |
| `classic-fonts.png` | Typography with the real faces loaded |
| `mobile-*.png` | Pixel 7 sweep of every new feature |

## Things that need Aiden

1. **Resume PDF still carries a phone number.** `public/aiden-hock-resume.pdf`
   is a placeholder export; the source docx contains `(951) 337-6434`.
   Strip it, re-export, and drop the PDF over the placeholder — the
   standing rule is that no committed version carries a home address or
   phone number. Email is fine to keep.
2. **Real memorial entries.** Three placeholders ship. Replacing them
   means writing `src/content/memorials.ts` — and honouring the consent
   rule above for anyone living.
3. **Custom domain.** `sunsetlan.vercel.app` is still the placeholder in
   `og:url`, the new `<link rel="canonical">`, and `sitemap.xml`. All
   three change together.
4. **Analytics vendor.** The stub is still off by default behind
   `VITE_ANALYTICS`; wiring a provider is a decision I deliberately did
   not make for you.
5. **Formspree delivery address.** Worth confirming in the dashboard
   that submissions land where you expect before launch.
6. **Real content** for projects, music, videos, and about — the modals
   ship friendly empty states in the meantime, and `CONTENT.md` documents
   the drop-in flow for each.

## Nothing was skipped

Every task in the batch was completed. Two judgment calls were made
without asking, per the run's operating rules: self-hosting the fonts
(reasoning above) and treating the intro-hint/minimap overlap found in
the mobile sweep as in-scope for the quality pass rather than deferring
it.
