// Ingest Aiden's hand-cut audio library (owner-provided MP3s) from the
// ./SLaudiofiles staging folder into the category pools under
// src/assets/audio/<category>/ (CLAUDE.md Audio system). Rerunnable:
// numbering continues after existing pool files; the staging folder is
// deleted only once empty. Usage: node scripts/ingest-audio.mjs
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const STAGING = path.join(ROOT, 'SLaudiofiles')
const DEST = path.join(ROOT, 'src', 'assets', 'audio')

// LONGEST-FIRST so named prefixes win over single letters.
const RULES = [
  ['wave', 'waves'],
  ['gull', 'seagulls'],
  ['fire', 'campfire'],
  ['g', 'footsteps-grass'],
  ['s', 'footsteps-sand'],
  ['w', 'footsteps-dock'],
]

/** Minimal MP3 sanity: skip ID3v2, find a valid frame header; return
 * the channel mode. Enough to catch truncated/corrupt files without a
 * decoder dependency (runtime decode is the real gate). */
function inspectMp3(buf) {
  let off = 0
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    const size =
      ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f)
    off = 10 + size
  }
  for (let i = off; i < Math.min(buf.length - 4, off + 65536); i++) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue
    const version = (buf[i + 1] >> 3) & 0x03
    const layer = (buf[i + 1] >> 1) & 0x03
    const bitrate = (buf[i + 2] >> 4) & 0x0f
    const samplerate = (buf[i + 2] >> 2) & 0x03
    if (version === 1 || layer === 0 || bitrate === 0x0f || samplerate === 3) continue
    const channelMode = (buf[i + 3] >> 6) & 0x03
    return { valid: true, stereo: channelMode !== 3 }
  }
  return { valid: false, stereo: false }
}

if (!fs.existsSync(STAGING)) {
  console.log('No ./SLaudiofiles staging folder — nothing to ingest.')
  process.exit(0)
}

const files = fs.readdirSync(STAGING).filter((f) => /\.mp3$/i.test(f))
const unmatched = []
const bad = []
const summary = new Map() // category -> { files, stereo }

// Per-category next index continues after existing pool files (rerunnable).
const nextIndex = (category) => {
  const dir = path.join(DEST, category)
  fs.mkdirSync(dir, { recursive: true })
  let max = 0
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(new RegExp(`^${category}-(\\d+)\\.mp3$`))
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}
const counters = new Map()

for (const file of files.sort()) {
  const key = file.toLowerCase().replace(/\s+/g, '')
  const rule = RULES.find(([prefix]) => key.startsWith(prefix))
  if (!rule) {
    unmatched.push(file)
    continue
  }
  const category = rule[1]
  const buf = fs.readFileSync(path.join(STAGING, file))
  const info = inspectMp3(buf)
  if (!info.valid) {
    bad.push(file)
    continue
  }
  if (!counters.has(category)) counters.set(category, nextIndex(category))
  const n = counters.get(category)
  counters.set(category, n + 1)
  const name = `${category}-${String(n).padStart(2, '0')}.mp3`
  fs.renameSync(path.join(STAGING, file), path.join(DEST, category, name))
  const s = summary.get(category) ?? { files: 0, stereo: 0 }
  s.files++
  if (info.stereo) s.stereo++
  summary.set(category, s)
}

console.log('\ncategory          files  stereo')
console.log('-'.repeat(32))
for (const [cat, s] of [...summary.entries()].sort()) {
  console.log(`${cat.padEnd(18)}${String(s.files).padStart(5)}${String(s.stereo).padStart(8)}`)
}
if (unmatched.length) console.log(`\nUNMATCHED (left in staging): ${unmatched.join(', ')}`)
if (bad.length) console.log(`\nINVALID MP3 (left in staging): ${bad.join(', ')}`)

const left = fs.readdirSync(STAGING)
if (left.length === 0) {
  fs.rmdirSync(STAGING)
  console.log('\nStaging folder empty — removed.')
} else {
  console.log(`\nStaging folder kept (${left.length} file(s) remain).`)
}
