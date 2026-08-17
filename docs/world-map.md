# World map

Generated from `src/content/monuments.json` by `node scripts/world-map.mjs`.
Edit the JSON to move something; every consumer (scene placement,
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

## Structures

| id | what | lat | long | facing | lift | notes |
|---|---|---|---|---|---|---|
| `cemetery` | Memorial garden — fenced plot | 47 | 107 | 0° N | — | 17 × 13 m. Gate on the south (downhill) side. Interior fully walkable. |
| `dock` | Dock | 24 | 0 | 180° S | — | Runs lat 24 → 13 down its meridian; DOCK in planetConfig holds the strip. |

## Props

| id | what | lat | long | facing | lift | notes |
|---|---|---|---|---|---|---|
| `campfire` | Campfire | 22 | 180 | 0° N | — |  |
| `rowboat` | Beached rowboat | 18 | 210 | 0° N | — |  |

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

## Moving something

1. Edit its `lat` / `long` / `facingDeg` in `src/content/monuments.json`.
2. Run `node scripts/world-map.mjs` to refresh this page.
3. Run `npx vitest run` — the index tests catch duplicate ids, out-of-range
   coordinates, and interactables whose monument went missing.

Blockers, prompts, and minimap dots all derive from these numbers, so
nothing else needs editing to relocate a monument.
