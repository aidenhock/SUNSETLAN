/**
 * Regenerates docs/world-map.md from src/content/monuments.json — the
 * readable index of where everything on the island stands and which way
 * it faces. Run it after moving anything:
 *
 *   node scripts/world-map.mjs
 *
 * The JSON is the source of truth; this file is the printout.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const { monuments } = JSON.parse(readFileSync(resolve('src/content/monuments.json'), 'utf8'))

const KIND_ORDER = ['interactable', 'structure', 'prop', 'npc', 'seat']
const compass = (deg) => {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8
  return names[idx]
}

let out = `# World map

Generated from \`src/content/monuments.json\` by \`node scripts/world-map.mjs\`.
Edit the JSON to move something; every consumer (scene placement,
blockers, the minimap, \`planetConfig.MAP\`) follows from it.

- **lat** 90 is the pole where you spawn; grass ends around 66, sand runs
  24 down to the waterline at 15.
- **long** 0 is the sunset side (sun, dock); 180 is the night side (campfire).
- **facing** is degrees from local north — 0 looks uphill toward the pole,
  90 looks east. The compass letter is the same thing, rounded.
- **lift** is extra metres above the ground, for things standing on
  furniture or hanging in the air.

`

for (const kind of KIND_ORDER) {
  const rows = monuments.filter((m) => m.kind === kind)
  if (!rows.length) continue
  out += `## ${kind[0].toUpperCase()}${kind.slice(1)}s\n\n`
  out += '| id | what | lat | long | facing | lift | notes |\n'
  out += '|---|---|---|---|---|---|---|\n'
  for (const m of rows) {
    const facing = `${m.facingDeg}° ${compass(m.facingDeg)}`
    const lift = m.liftM ? `${m.liftM} m` : '—'
    const size = m.size ? `${m.size.widthM} × ${m.size.depthM} m. ` : ''
    out += `| \`${m.id}\` | ${m.label} | ${m.lat} | ${m.long} | ${facing} | ${lift} | ${size}${m.notes ?? ''} |\n`
  }
  out += '\n'
}

out += `## Moving something

1. Edit its \`lat\` / \`long\` / \`facingDeg\` in \`src/content/monuments.json\`.
2. Run \`node scripts/world-map.mjs\` to refresh this page.
3. Run \`npx vitest run\` — the index tests catch duplicate ids, out-of-range
   coordinates, and interactables whose monument went missing.

Blockers, prompts, and minimap dots all derive from these numbers, so
nothing else needs editing to relocate a monument.
`

writeFileSync(resolve('docs/world-map.md'), out)
console.log(`docs/world-map.md — ${monuments.length} monuments`)
