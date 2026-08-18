/**
 * Fails the build if the dev-only world placement editor leaks into a
 * production bundle. The editor talks to a Vite dev-server-only endpoint
 * (`/__write-placements`, see write-placements-plugin.mjs) and must never
 * ship — this is the check with teeth, not just the `apply: 'serve'` guard.
 *
 *   npm run build && node scripts/check-prod-bundle.mjs
 *
 * Dependency-free (node built-ins only), so it runs anywhere the build runs.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const DIST = resolve('dist')
const BANNED_STRINGS = ['__write-placements', 'placement-editor']
const BANNED_FILENAME_RE = /editor/i

if (!existsSync(DIST)) {
  console.error(`dist/ not found at ${DIST} — run "npm run build" first.`)
  process.exit(1)
}

const indexHtml = join(DIST, 'index.html')
if (!existsSync(indexHtml)) {
  console.error(`${indexHtml} is missing — this doesn't look like a real build.`)
  process.exit(1)
}

/** Every file path under dir, recursively. */
function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      out.push(...walk(path))
    } else {
      out.push(path)
    }
  }
  return out
}

const files = walk(DIST)
let failed = false

for (const file of files) {
  if (BANNED_FILENAME_RE.test(file)) {
    console.error(`FAIL: filename matches /editor/i: ${file}`)
    failed = true
  }

  const contents = readFileSync(file, 'utf8')
  for (const needle of BANNED_STRINGS) {
    if (contents.includes(needle)) {
      console.error(`FAIL: "${needle}" found in ${file}`)
      failed = true
    }
  }
}

if (failed) {
  process.exit(1)
}

console.log(`prod bundle clean: no editor code in ${files.length} files`)
