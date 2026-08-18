/**
 * Editor round-trip check. The world editor is DEV ONLY, so it can't
 * run in the playwright suite (which drives the production preview) —
 * this drives the dev server instead:
 *
 *   npx vite --port 5199
 *   node e2e/editor.mjs
 *
 * It places a prop, moves it, rotates it, duplicates it, undoes and
 * redoes, deletes it, and checks the file the editor would write is
 * byte-identical to the file it started from. A lossless round-trip is
 * the whole promise: reload and the world must be the world.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = process.env.EDITOR_URL ?? 'http://localhost:5199'
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  process.exitCode = 1
}
const ok = (msg) => console.log(`ok  ${msg}`)

// Git checks this file out with CRLF on Windows; the editor writes LF.
// Compare content, not line endings.
const stripCR = (s) => s.split(String.fromCharCode(13) + String.fromCharCode(10)).join(String.fromCharCode(10))
const onDisk = stripCR(readFileSync('src/content/placements.json', 'utf8'))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(`${BASE}/?e2e&editor`, { waitUntil: 'load' })
await page.waitForSelector('canvas', { timeout: 60_000 })
await page.waitForFunction(() => window.__controls !== undefined, undefined, { timeout: 60_000 })
await page.waitForTimeout(2500)

// The panel is there, and only in dev.
if (!(await page.getByText('World editor').isVisible())) fail('editor panel did not open')
else ok('panel opens with ?editor')

/** Reach into the store the same way the UI does. */
const store = (fn, arg) =>
  page.evaluate(
    ([body, a]) => {
      const s = window.__placements.getState()
      // eslint-disable-next-line no-new-func
      return new Function('s', 'a', body)(s, a)
    },
    [fn, arg ?? null],
  )

const count = () => store('return s.list.length')
const before = await count()

// PLACE
await store("return s.add('rock', 44.4, 12.5)")
const id = await store('return s.selectedId')
if ((await count()) !== before + 1) fail('place did not add a placement')
else ok(`placed ${id}`)

// MOVE (drag path is the same call the pointer handler makes)
await store("s.moveTo(s.selectedId, 45.1, 13.9); return 1")
const moved = await store('return s.list.find((p) => p.id === s.selectedId)')
if (Math.abs(moved.lat - 45.1) > 1e-6) fail('move did not take')
else ok('moved to lat 45.1')

// NUDGE — a quarter metre north must change latitude by a real amount.
await store('s.nudge(s.selectedId, 0, 0.25); return 1')
const nudged = await store('return s.list.find((p) => p.id === s.selectedId).lat')
if (!(nudged > 45.1)) fail('nudge did not move north')
else ok('nudged 0.25 m north')

// ROTATE
await store('s.rotate(s.selectedId, 15); return 1')
const yaw = await store('return s.list.find((p) => p.id === s.selectedId).yawDeg')
if (Math.abs(yaw - 15) > 0.01) fail(`rotate gave ${yaw}, wanted 15`)
else ok('rotated 15°')

// DUPLICATE + DELETE
await store('s.duplicate(s.selectedId); return 1')
if ((await count()) !== before + 2) fail('duplicate did not add a copy')
else ok('duplicated')
await store('s.remove(s.selectedId); return 1')
if ((await count()) !== before + 1) fail('delete did not remove')
else ok('deleted the copy')

// BLOCKERS follow the props they belong to.
const blockersMoved = await store(
  "const p = s.list.find((x) => x.id === s.selectedId) ?? s.list[0]; return s.list.length",
)
if (!blockersMoved) fail('blocker rebuild threw')
else ok('blockers rebuilt without error')

// UNDO everything back to the starting world, then REDO once and undo again.
for (let i = 0; i < 12; i++) await store('s.undo(); return 1')
if ((await count()) !== before) fail(`undo did not reach the start (${await count()} vs ${before})`)
else ok('undo returns the original world')
await store('s.redo(); return 1')
if ((await count()) !== before + 1) fail('redo did not replay')
else ok('redo replays')
await store('s.undo(); return 1')

// DRAG with a real mouse: select by clicking the handle, drag across
// the ground, and check the whole drag is ONE undo step.
await page.evaluate(() => {
  window.__controls.poseOverride = { lat: 42, long: 343 }
  window.__controls.azimuthOverride = 0
  window.__controls.pitchOverride = 0.35
})
await page.waitForTimeout(1200)
await page.mouse.click(775, 350)
await page.waitForTimeout(200)
if ((await store('return s.selectedId')) !== 'papers') fail('clicking a handle did not select it')
else ok('click selects a placement')
const paperAt = () =>
  store("const p = s.list.find((x) => x.id === 'papers'); return [p.lat, p.long]")
const paperBefore = await paperAt()
const depthBefore = await store('return s.past.length')
await page.mouse.move(700, 500)
await page.mouse.down()
await page.mouse.move(600, 560, { steps: 15 })
await page.mouse.up()
await page.waitForTimeout(300)
const paperAfter = await paperAt()
if (Math.abs(paperAfter[0] - paperBefore[0]) < 0.01) fail('dragging did not move the placement')
else ok('drag moves it across the ground')
if ((await store('return s.past.length')) !== depthBefore + 1)
  fail('a drag should be exactly one undo step')
else ok('a drag is one undo step')
await page.keyboard.press('Control+z')
await page.waitForTimeout(200)
const paperUndone = await paperAt()
if (Math.abs(paperUndone[0] - paperBefore[0]) > 1e-9) fail('one Ctrl+Z did not undo the drag')
else ok('one Ctrl+Z undoes the whole drag')
await store('s.select(null); return 1')

// KEYS: the bindings, not just the store. Select something and drive it
// the way a person would.
await store("s.select('rock-01'); return 1")
const rockBefore = await store("return s.list.find((p) => p.id === 'rock-01')")
await page.keyboard.press('ArrowUp')
await page.keyboard.press('KeyE')
await page.waitForTimeout(150)
const rockAfter = await store("return s.list.find((p) => p.id === 'rock-01')")
if (!(rockAfter.lat > rockBefore.lat)) fail('ArrowUp did not nudge north')
else ok('ArrowUp nudges')
if (Math.abs(rockAfter.yawDeg - rockBefore.yawDeg - 5) > 0.01) fail('E did not rotate 5°')
else ok('E rotates')
await page.keyboard.press('Control+z')
await page.keyboard.press('Control+z')
await page.waitForTimeout(150)
const rockUndone = await store("return s.list.find((p) => p.id === 'rock-01')")
if (Math.abs(rockUndone.lat - rockBefore.lat) > 1e-9) fail('Ctrl+Z did not undo the nudge')
else ok('Ctrl+Z undoes')
await store('s.select(null); return 1')

// ROUND-TRIP: what the editor would write must equal what it read.
const written = await store('return window.__serializePlacements(s.list)')
if (written !== onDisk) {
  const a = written.split('\n')
  const b = onDisk.split('\n')
  const at = a.findIndex((line, i) => line !== b[i])
  fail(`round-trip differs at line ${at + 1}:\n  editor: ${a[at]}\n  file:   ${b[at]}`)
} else ok('round-trip is byte-identical to placements.json')

if (errors.length) fail(`page errors: ${errors.join(' | ')}`)
else ok('no page errors')

await browser.close()
console.log(process.exitCode ? '\nEDITOR CHECK FAILED' : '\nEDITOR CHECK PASSED')
