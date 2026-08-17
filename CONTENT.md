# Content — Aiden's drop-in guide

**Golden rule: content edits happen ONLY in `src/content/`.** Every field
below is plain data — arrays and objects exported from six files. Nothing
about layout, styling, or the 3D scene lives there, and nothing in
`src/content/` should ever need scene code to change alongside it. Each
category renders a friendly empty (or partial) state until it's filled in,
so the site never looks broken while you're still gathering material — see
the "empty state" note under each section below.

`src/content/characters.ts` is **not** portfolio content — it's rig
configuration for the 3D avatar (Aiden's on-screen look) and NPC
appearances (Koa, the future feminine-villager template). Skip it here;
touching it is an art-direction change, not a content edit.

## Where each category shows up in the world

Every category is both a modal (the popup you fill in below) and a
physical prop on the island (`src/content/interactables.ts`), so visitors
find it by walking up and pressing E:

| Category | Prop | Prompt | Location |
|---|---|---|---|
| Photos | Camera tripod | "Look through the camera" | Dock's far end, over the water |
| Projects | Palapa desk | "Check the monitor" | Day-leaning side of the island |
| Music | Ukulele on the log | "Pick up the ukulele" | By the campfire, night beach |
| Videos | CRT TV on a crate | "Turn on the TV" | Night beach |
| About | Tree rings | "Grab the rings" | Big tree, dusk boundary |
| Contact | Mailbox | "Open the mailbox" | Dock entrance |

---

## Photos — `src/content/photos.ts`

```ts
export interface Photo {
  id: string      // stable slug, e.g. 'anza-sunset'
  full: string    // imported web-size WebP (longest edge ~1800 px)
  thumb: string   // imported ~480 px WebP (the grid cover-crops it)
  width: number   // intrinsic px of `full` — layout never guesses
  height: number
  alt: string     // real description for screen readers
  title: string   // shown under the full-screen photo
  caption?: string // optional second line under the title
}
```

**Where it renders**: `src/ui/modals/GalleryModal.tsx` — a paginated
grid (6 per page, 3×2 desktop / 2×3 mobile, "7–12 of 13" counter,
arrows/dots/keyboard/swipe) and a full-screen viewer (image FIT, never
cropped; ← → moves through ALL photos continuously; the grid follows).
Thumbs lazy-load; nothing downloads until the tripod modal opens. The
`/classic` page reuses the same array.

**The pipeline** (two sizes per photo, dimensions recorded):

1. Drop originals (PNG/JPG/WebP, any size) into `staging/photos/` —
   name each file the slug you want, e.g. `anza-sunset.png`
   (`staging/` is gitignored; originals never ship).
2. `node scripts/optimize-images.mjs` → writes
   `src/assets/photos/<slug>.webp` (≤ 1800 px, ~≤ 300 KB) and
   `<slug>.thumb.webp` (480 px), and prints a paste-ready import +
   entry block including width/height.
3. Paste into `src/content/photos.ts`, fill `alt`/`title`/`caption`.
   **Drafted copy for the 13 attached photos already sits in a comment
   block at the top of `photos.ts`** — pair each staged file with its
   slug there and the titles/alt text are ready to edit.

**Example entry**:

```ts
import anzaSunsetFull from '../assets/photos/anza-sunset.webp'
import anzaSunsetThumb from '../assets/photos/anza-sunset.thumb.webp'

{
  id: 'anza-sunset',
  full: anzaSunsetFull,
  thumb: anzaSunsetThumb,
  width: 1800,
  height: 1350,
  alt: 'Fiery orange clouds streaking over dark desert mountains, boulders and brush in the foreground',
  title: 'Anza sunset',
  caption: 'Borrego overlook, last light',
},
```

## Projects — `src/content/projects.ts`

```ts
export interface Project {
  title: string
  blurb: string
  tech: string[]
  link?: string
  repo?: string
}
```

- **`title`** (required, `string`) — the card heading (`<h3>`). Also used
  as the React list key, so it must be unique.
- **`blurb`** (required, `string`) — one paragraph under the title.
- **`tech`** (required, `string[]`) — rendered as small rounded pill
  badges under the blurb, one per entry.
- **`link?`** (optional, `string`) — a "Visit" external link (opens in a
  new tab). Shown only when present.
- **`repo?`** (optional, `string`) — a "View code" external link, same
  treatment. `link` and `repo` can both be set (both links show); if
  neither is set, that whole link row is omitted.

**Where it renders**: `src/ui/modals/ProjectsModal.tsx` — a vertical list
of bordered cards.

**Empty state**: if `projects` is empty, the modal shows "Projects are
being written up — Case studies land here soon — pipelines, apps, and the
making of this island."

**Assets**: none — projects are text + links only.

**Example entry**:

```ts
{
  title: 'Retail ETL Pipeline',
  blurb:
    'Nightly pipeline pulling POS data from 40 stores into a warehouse, feeding a same-day sales dashboard the ops team checks every morning.',
  tech: ['Python', 'SQL', 'Airflow', 'dbt'],
  link: 'https://dashboard.example.com',
  repo: 'https://github.com/aidenhock/retail-etl',
},
```

---

## Music — `src/content/music.ts`

```ts
export interface Track {
  title: string
  /** Streaming embed (Spotify/SoundCloud/Bandcamp iframe URL). */
  embedUrl?: string
  /** Or a locally hosted audio file. */
  audioSrc?: string
}
```

- **`title`** (required, `string`) — heading above the player. Also the
  React list key, so it must be unique.
- **`embedUrl?`** (optional, `string`) — a Spotify/SoundCloud/Bandcamp
  *embed* URL (not the regular share link — use each service's "embed"
  or "iframe src" URL). Renders as an `<iframe>`. Takes priority over
  `audioSrc` if both are set.
- **`audioSrc?`** (optional, `string`) — used only when `embedUrl` is
  absent; renders a native `<audio controls>` player (`preload="none"`).
- If a track has **neither**, it renders "Recording coming soon." for
  that one track — different from the whole-category empty state below.

**Where it renders**: `src/ui/modals/MusicModal.tsx`, and the same data
also powers the `/classic` fallback page (`src/classic/ClassicPage.tsx`).

**Empty state**: only if the `music` array itself is empty (`length ===
0`) does the modal show "The ukulele is still warming up — Recordings are
on their way — for now, Koa on the dock has the stage." Today the array
already has two title-only placeholder entries, so in practice you'll see
"Recording coming soon." per track until you add `embedUrl`/`audioSrc`.

**Assets — two separate systems, same file if you want**: `audioSrc`
here only feeds this modal's `<audio>` player — it is unrelated to the
in-world ambient music loop the island plays while you walk around (that
pool lives at `src/assets/audio/music/*.mp3` and is picked up
automatically by the audio system with zero code changes — see
`CREDITS.md`; that folder is empty today, so the island currently falls
back to a generated lo-fi pad). If you want the same recording to do
double duty — playable in the Music modal *and* part of the ambient
loop — drop the mp3 in `src/assets/audio/music/`, import it in
`music.ts`, and set `audioSrc` to the import. They don't have to match;
it's just a convenient option.

**Example entry**:

```ts
import sundown from '../assets/audio/music/sundown.mp3'

export const music: Track[] = [
  { title: 'Sundown (original)', audioSrc: sundown },
  { title: 'Live at the dock', embedUrl: 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC' },
]
```

---

## Videos — `src/content/videos.ts`

```ts
export interface Video {
  title: string
  youtubeId: string
}
```

- **`title`** (required, `string`) — heading above the thumbnail, and the
  `<iframe>`/alt-text title once playing. Also the React list key
  (must be unique).
- **`youtubeId`** (required, `string`) — the bare **11-character YouTube
  video ID**, not the full URL. From
  `https://www.youtube.com/watch?v=ABCDEFGHIJK` or `https://youtu.be/ABCDEFGHIJK`,
  the ID is `ABCDEFGHIJK`. Used to build both the
  `youtube-nocookie.com/embed/{id}` iframe (autoplay on click) and the
  `i.ytimg.com/vi/{id}/hqdefault.jpg` thumbnail — no other fields needed.

**Where it renders**: `src/ui/modals/VideosModal.tsx` — a thumbnail grid;
clicking a thumbnail swaps it for a lazy-loaded iframe (nothing embeds
until clicked).

**Empty state**: if `videos` is empty, the modal shows "The CRT is
between broadcasts — Videos arrive here soon — the static is part of the
charm."

**Assets**: none — videos stay hosted on YouTube; only the ID is stored.

**Example entry**:

```ts
{ title: 'Building the island: a devlog', youtubeId: 'ABCDEFGHIJK' },
```

---

## About — `src/content/about.ts`

```ts
export interface CardContent {
  title: string
  body: string[]
}
```

- **`title`** (required, `string`) — the modal heading.
- **`body`** (required, `string[]`) — one paragraph per array entry,
  rendered in order.

The file also exports `cards: Record<string, CardContent>`, a lookup by
`contentKey` — `about` is currently the only entry, and it's the one the
About interactable (the tree rings) points to. Don't delete the `about`
key; edit its `title`/`body` in place.

**Where it renders**: `src/ui/modals/CardModal.tsx`. Note: if a
`contentKey` were ever missing from `cards`, the modal renders nothing at
all (no empty-state copy) — so this entry must always exist.

**Assets**: none — text only.

**Example entry** (replace the placeholder body with your real bio,
~150 words, as one or more paragraphs):

```ts
export const about: CardContent = {
  title: "Hey, I'm Aiden",
  body: [
    "I'm a data analyst and developer — Python, SQL, ETL pipelines, a bit of Flask and React. I like turning messy operational data into something a team can actually act on.",
    'This island is a side project: a tiny rotating-planet portfolio built with React Three Fiber. Everything on it — the character, the dock, the campfire — is hand-built from primitives, no imported 3D assets.',
  ],
}
```

---

## Contact — `src/content/contact.ts`

```ts
export interface Contact {
  email: string
  links: { label: string; url: string }[]
}
```

- **`email`** (required, `string`) — builds the `mailto:` link behind the
  "Email me" button.
- **`links`** (required, array, can be empty) — each `{ label, url }`
  renders as its own external link below the email button, labeled by
  `label`. No empty-state message if the array is empty — the intro
  paragraph and "Email me" button always show regardless.

**Where it renders**: `src/ui/modals/ContactModal.tsx`.

**Assets**: none.

**Example entry**:

```ts
export const contact: Contact = {
  email: 'aidinihock@gmail.com',
  links: [
    { label: 'GitHub', url: 'https://github.com/aidenhock' },
    { label: 'LinkedIn', url: 'https://www.linkedin.com/in/aidenhock' },
  ],
}
```

---

## Papers — `src/content/papers.ts`

```ts
export interface Paper {
  id: string      // stable slug, e.g. 'resume'
  title: string
  blurb: string   // one line under the title
  file: string    // public path, e.g. '/aiden-hock-resume.pdf'
  type: 'pdf'
}
```

**Where it renders**: the bulletin board's Papers modal
(`src/ui/modals/PapersModal.tsx`) and the `/classic` Papers section —
View opens the browser's PDF viewer in a new tab, Download saves it;
nothing is fetched until clicked. Empty array → friendly empty state.

**Where files go**: drop PDFs in `public/` with clean kebab-case names.
The resume at `/aiden-hock-resume.pdf` is currently a PLACEHOLDER: the
real one's header contains a phone number (privacy rule — never ship).
To finish: strip the phone from the docx, export as PDF from Word, and
replace `public/aiden-hock-resume.pdf`.

## Memorials — `src/content/memorials.ts`

A quiet walled garden past the terminator (lat 47, long 107). Each
entry is one headstone; the front row is interactable ("E — Remember").
The same list renders as the Memorials section on /classic.

```ts
{
  id: 'memorial-4',          // unique; also the interactable id if front-row
  name: 'Rex',
  years: '2008 – 2023',      // optional
  relation: 'Family dog',
  message: 'A few quiet lines.',
  photo: '/memorials/rex.webp', // optional, under public/memorials/
}
```

Drop photos through `scripts/optimize-images.mjs` like everything else.

**CONSENT RULE (binding): names and photos of living people require
their explicit okay before shipping publicly; pets are Aiden's call.**
The three placeholder stones ship until real entries replace them.

## Build log — `docs/build-log.md` (no content file)

The portal room and the /classic Build log section render the chapters
in `docs/build-log.md`, exported to JSON by
`node scripts/export-build-log.mjs` (which also captures the real code
excerpts). Write chapters for visitors first, developers second — and
put failed experiments in `Decisions:`, they're the best part. There
is nothing to fill in here beyond writing chapters.

## The world index — `src/content/monuments.json`

Where everything on the island stands. One entry per object with `lat`,
`long`, `facingDeg` (degrees from local north, positive east) and
optional `liftM`. Move a monument by editing its numbers here — the
model, its collision, its minimap dot, and the docs all follow. Then:

```
node scripts/world-map.mjs     # refreshes docs/world-map.md
npx vitest run                 # catches typos, duplicates, off-island coords
```

`docs/world-map.md` is the readable table of the same data.

## The room's murals — `src/content/murals.ts`

The screenshots hanging in the rift room, each tied to a build-log
chapter. To refresh them after the world's look changes:

```
npm run build && npx vite preview --port 4173
node scripts/capture-murals.mjs
```

To add one: capture a shot into `public/murals/<id>.jpg`, then add an
entry with a free wall position (`at`), the wall's `faceYaw`, the
`chapterId` it explains, and a caption (the caption is what the E
prompt says).

## Aiden's gathering checklist

**Photos** (`src/content/photos.ts`)
- [ ] 8–16 photos, originals dropped in `staging/photos/`
- [ ] Run `node scripts/optimize-images.mjs`; paste the generated import +
      entry lines into `photos.ts`
- [ ] Every photo has a real `alt` (required, accessibility) and a
      `caption`
- [ ] `location` filled in where it adds context (optional)

**Projects** (`src/content/projects.ts`)
- [ ] 3–6 projects
- [ ] Each has a `title`, a real `blurb`, and a `tech` list
- [ ] `link` and/or `repo` where they exist (at least one recommended,
      neither is required)

**Music** (`src/content/music.ts`)
- [ ] At least one real track (replace the two title-only placeholders)
- [ ] Each track has an `embedUrl` or an `audioSrc`
- [ ] Decide whether any `audioSrc` files should also live in
      `src/assets/audio/music/` to join the in-world ambient pool

**Videos** (`src/content/videos.ts`)
- [ ] 2–4 videos (replace the two CC-licensed placeholders)
- [ ] Each has a `title` and the bare YouTube `youtubeId`

**About** (`src/content/about.ts`)
- [ ] Rewrite `about.body` with a real ~150-word bio (one or more
      paragraphs)

**Contact** (`src/content/contact.ts`)
- [ ] Confirm `email`
- [ ] Add LinkedIn (and any other links you want live) to `links`
