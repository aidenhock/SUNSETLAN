// The crossing: board the boat at the island's dock, drive south down
// longitude 0 across the open ocean, and tie up at Antarctica's dock.
// Drives the real world and saves five screenshots of the trip.
//
// Usage: npm run dev  (port 5173) — or npm run build && npm run preview
//   node e2e/boat.mjs [--out <dir>] [--url http://localhost:5173]
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i > -1 ? process.argv[i + 1] : fallback
}
const BASE = arg('--url', process.env.BOAT_URL || 'http://localhost:5173')
const OUT = arg('--out', 'boat-shots')

/** The deck's EAST edge at the dock's far end — beside the mooring, so
 * the boat is nearer than the Photos tripod and E boards. */
const START = '13.4,1.0'
/** The drive is long: Antarctica is most of a hemisphere away. */
const ARRIVE_TIMEOUT_MS = 60_000

const boatState = (page) => page.evaluate(() => window.__store.getState().boat)

async function main() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  const shot = async (name) => {
    const path = join(OUT, name)
    await page.screenshot({ path })
    console.log('  shot', path)
  }

  await page.goto(`${BASE}/?e2e&at=${START}`, { waitUntil: 'load' })
  await page.waitForSelector('canvas', { timeout: 30_000 })
  await page.waitForFunction(() => window.__store !== undefined && window.__controls !== undefined)
  await page.waitForTimeout(2500) // let the teleport land and the sky settle

  // 1 — the boat at its mooring, beside the dock's far end.
  console.log('1 · moored')
  await shot('boat-1-moored.png')

  // 2 — board. E is the boat's key here: it outranks the dock-end tripod.
  console.log('2 · board')
  await page.keyboard.press('KeyE')
  // The tween is 0.45 s of FRAMES, so a slow dev build takes longer than
  // 0.45 s of wall clock — wait on the state, not the clock.
  await page
    .waitForFunction(() => window.__store.getState().boat.state === 'driving', { timeout: 5000 })
    .catch(() => {
      console.error('FAIL: E did not put us in the boat')
      process.exitCode = 1
    })
  await page.waitForTimeout(300)
  await shot('boat-2-boarded.png')

  // 3 — drive. The spawn camera azimuth (π) faces longitude 0, so W from
  // the dock end runs SOUTH down the meridian toward Antarctica.
  console.log('3 · driving south')
  const t0 = Date.now()
  await page.keyboard.down('KeyW')
  // Mid-way: the island is behind, the ice is not yet ahead, and polar
  // night has begun to take the sky (~80 m of ocean at 11 m/s ≈ 8 s).
  await page.waitForTimeout(4200)
  await shot('boat-3-ocean.png')
  let arrived = false
  while (Date.now() - t0 < ARRIVE_TIMEOUT_MS) {
    const s = await page.evaluate(() => window.__store.getState().nearbyDockFromBoat)
    if (s === 'south') {
      arrived = true
      break
    }
    await page.waitForTimeout(250)
  }
  await page.keyboard.up('KeyW')
  const crossingS = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`  crossing took ${crossingS}s${arrived ? '' : ' (NEVER ARRIVED)'}`)
  if (!arrived) process.exitCode = 1
  await page.waitForTimeout(500)
  await shot('boat-4-arrive.png')

  // 4 — tie up, and step out onto the ice shelf's dock.
  console.log('4 · tie up')
  await page.keyboard.press('KeyE')
  await page.waitForTimeout(1400)
  const end = await boatState(page)
  if (end.state !== 'moored' || end.at !== 'south') {
    console.error('FAIL: did not tie up in the south —', end)
    process.exitCode = 1
  }
  await shot('boat-5-docked.png')

  const real = errors.filter((e) => !e.includes('i.ytimg.com'))
  if (real.length) {
    console.error('page errors:', real.slice(0, 5))
    process.exitCode = 1
  }
  console.log(process.exitCode ? 'boat: FAILED' : 'boat: ok')
  await browser.close()
}

main()
