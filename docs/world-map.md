# World map

Generated from `src/content/placements.json` by `node scripts/world-map.mjs`.
Edit the JSON (or use `?editor` in dev) to move something; every consumer (scene placement,
blockers, the minimap, `planetConfig.MAP`) follows from it.

- **lat** 90 is the pole where you spawn; grass ends around 66, sand runs
  24 down to the waterline at 15.
- **long** 0 is the sunset side (sun, dock); 180 is the night side (campfire).
- **facing** is degrees from local north — 0 looks uphill toward the pole,
  90 looks east. The compass letter is the same thing, rounded.
- **lift** is extra metres above the ground, for things standing on
  furniture or hanging in the air.

## Interactables

| id | what | lat | long | facing | lift | notes |
|---|---|---|---|---|---|---|
| `photos` | Camera tripod — Photos | 14 | 0 | 180° S | — | On the dock's far end, over water, facing the sun. |
| `contact` | Mailbox — Contact | 24 | 6 | 180° S | — | Dock entrance. |
| `papers` | Bulletin board — Papers | 45 | 343 | 11.5° N | — | Grass, sunset side; angled toward the walking approach. |
| `about` | Moai — About | 50 | 300 | 0° N | — | Dusk boundary west. Walk fully around it. |
| `projects` | Palapa desk — Projects | 40 | 40 | 0° N | — |  |
| `music` | Stereo on the log — Music | 22 | 173 | 30° NE | — | By the campfire. |
| `videos` | CRT TV on crate — Videos | 21 | 150.8 | 60° NE | 0.8 m | Sits on the crate; screen glow reads at night. |
| `rift` | Rift portal — the build-log room | 32 | 97 | 0° N | 2.9 m | Floats. Step through to the room; the room is not on this map. |
| `memorial-1` | Headstone 1 | 45.6 | 104.4 | 180° S | — |  |
| `memorial-2` | Headstone 2 | 45.6 | 107 | 180° S | — |  |
| `memorial-3` | Headstone 3 | 45.6 | 109.6 | 180° S | — |  |
| `telescope` | Telescope — tonight's moon | 19.5 | 188 | 180° S | — | Night beach, aimed down the moon's meridian. |
| `paintings` | Easel — Paintings | 38 | 15 | 180° S | — | Day side grass, with a view. |
| `covers` | Mic stand — Covers | 26 | 168 | 110° E | — | Night beach, near the fire but clear of it. |

## Structures

| id | what | lat | long | facing | lift | notes |
|---|---|---|---|---|---|---|
| `cemetery` | Memorial garden — fenced plot | 47 | 107 | 0° N | — | 17 × 13 m. Gate on the south (downhill) side. Interior fully walkable. |
| `dock` | Dock | 24 | 0 | 180° S | — | Runs lat 24 → 13 down its meridian; DOCK in planetConfig holds the strip. |

## Props

| id | what | lat | long | facing | lift | notes |
|---|---|---|---|---|---|---|
| `campfire` | Campfire | 22 | 180 | 0° N | — |  |
| `rowboat` | Beached rowboat | 18 | 210 | 51.57° NE | — |  |
| `palapa-desk` | Palapa desk (collider only) | 40 | 38 | 0° N | — | Traces the desk built into the palapa; nothing renders from this entry. |
| `tv-crate` | CRT crate | 21 | 150.8 | 0° N | — | The TV stands on this; the TV entry carries the liftM that puts it on top. |
| `signpost` | Signpost at spawn | 84 | 20 | 0° N | — | Planks point at landmarks with live distances; both come from this file. |

## Npcs

| id | what | lat | long | facing | lift | notes |
|---|---|---|---|---|---|---|
| `koa` | Koa the ukulele player | 18 | 359.05 | 0° N | — | Seat ON the dock's west edge; altitude derives from the deck strip. |

## Seats

| id | what | lat | long | facing | lift | notes |
|---|---|---|---|---|---|---|
| `log-center` | Log — center | 25.3 | 180 | 0° N | — |  |
| `log-west` | Log — west flank | 23.4 | 176.7 | 54.4° NE | — |  |
| `log-east` | Log — east flank | 23.4 | 183.3 | -54.4° NW | — |  |

## Scatters

| id | what | lat | long | facing | lift | notes |
|---|---|---|---|---|---|---|
| `palm-01` | Palm 1 | 30 | 25 | 0° N | — |  |
| `palm-02` | Palm 2 | 28 | 70 | 322° NW | — |  |
| `palm-03` | Palm 3 | 33 | 110 | 284.19° W | — |  |
| `palm-04` | Palm 4 | 29 | 162 | 246.37° SW | — |  |
| `palm-05` | Palm 5 | 31 | 198 | 208.56° SW | — |  |
| `palm-06` | Palm 6 | 27 | 250 | 170.74° S | — |  |
| `palm-07` | Palm 7 | 32 | 288 | 132.93° SE | — |  |
| `palm-08` | Palm 8 | 29 | 335 | 95.11° E | — |  |
| `palm-09` | Palm 9 | 55 | 120 | 57.3° NE | — |  |
| `palm-10` | Palm 10 | 62 | 230 | 19.48° N | — |  |
| `rock-01` | Rock 1 | 19 | 60 | 341.48° N | — |  |
| `rock-02` | Rock 2 | 17 | 132 | 303.67° NW | — |  |
| `rock-03` | Rock 3 | 22 | 148 | 265.85° W | — |  |
| `rock-04` | Rock 4 | 20 | 262 | 228.04° SW | — |  |
| `rock-05` | Rock 5 | 26 | 315 | 190.22° S | — |  |
| `shell-01` | Shell 1 | 18 | 30 | 152.41° SE | — |  |
| `shell-02` | Shell 2 | 16.5 | 95 | 114.59° SE | — |  |
| `shell-03` | Shell 3 | 19 | 168 | 76.78° E | — |  |
| `shell-04` | Shell 4 | 17 | 228 | 38.96° NE | — |  |
| `shell-05` | Shell 5 | 18.5 | 296 | 1.15° N | — |  |

## Moving something

1. Edit its `lat` / `long` / `yawDeg` in `src/content/placements.json`.
2. Run `node scripts/world-map.mjs` to refresh this page.
3. Run `npx vitest run` — the index tests catch duplicate ids, out-of-range
   coordinates, and interactables whose placement went missing.

Blockers, prompts, and minimap dots all derive from these numbers, so
nothing else needs editing to relocate anything.
