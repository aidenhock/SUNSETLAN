# Credits

All 3D art is hand-built from three.js primitives (no imported models). The
character rig and low-poly techniques draw on published tutorials — see
`docs/style-playbook.md` for the full source list, chiefly Codrops'
"Creating 3D Characters in Three.js" (Barker, 2021) and "The Aviator"
(Maaloul, 2016).

## Audio

**Rule: only license-clean sources ever ship.** Every audio file in
`src/assets/audio/` must be listed here with its source and license
before it reaches `main`.

### Owner-provided library

The core sound library (waves, seagulls, campfire, and all footstep
pools — 120 hand-cut MP3s) consists of **Aiden's own recordings and
cuts**, ingested via `scripts/ingest-audio.mjs`. Owner-provided; all
rights held by the site owner.

| Files | Source | License |
|---|---|---|
| `waves/waves-*.mp3` (7) | Aiden — own recordings/cuts | owner-provided |
| `seagulls/seagulls-*.mp3` (8) | Aiden — own recordings/cuts | owner-provided |
| `campfire/campfire-*.mp3` (4) | Aiden — own recordings/cuts | owner-provided |
| `footsteps-grass/*.mp3` (31) | Aiden — own recordings/cuts | owner-provided |
| `footsteps-sand/*.mp3` (26) | Aiden — own recordings/cuts | owner-provided |
| `footsteps-dock/*.mp3` (44) | Aiden — own recordings/cuts | owner-provided |

### Third-party template

Add new third-party entries in this exact form (no entry, no ship):

| File | Source | License | Link |
|---|---|---|---|
| `music/lofi-loop.mp3` | *(artist — track)* | *(e.g. CC BY 4.0)* | *(url)* |
