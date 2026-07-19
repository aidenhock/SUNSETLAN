// Screenshot sweep around the island for visual QA (CLAUDE.md 3A/3B
// acceptance: "no prop floats at the horizon or sinks up close").
// Usage: npm run build && npm run preview  (port 4173), then:
//   node e2e/sweep.mjs [outputDir]
// Uses the ?e2e pose/azimuth overrides to teleport between vantage points.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.SWEEP_URL || 'http://localhost:4173'
const OUT = resolve(process.argv[2] || 'sweep-shots')
const deg = (d) => (d * Math.PI) / 180

// Facing math: after a pose teleport, "north" (toward the pole / island
// interior) is camera azimuth = long; south = long + 180°; east = long - 90°.
const SHOTS = [
  { name: '01-spawn-first-sight', lat: 90, long: 0, az: Math.PI, note: 'spawn view toward long 0: dock + water' },
  { name: '02-dock-from-side', lat: 18, long: 352, az: deg(352) - Math.PI / 2, note: 'dock profile from the west' },
  { name: '03-dock-walk-out', lat: 20, long: 0, az: deg(0) + Math.PI, note: 'on the deck looking out to sea' },
  { name: '04-mailbox', lat: 21, long: 6, az: deg(6), note: 'mailbox at the dock entrance' },
  { name: '05-palapa', lat: 35.5, long: 40, az: deg(40), note: 'palapa + projects desk' },
  { name: '06-tree-rings', lat: 45.5, long: 300, az: deg(300), note: 'big tree + rings' },
  { name: '07-night-beach', lat: 17.5, long: 179, az: deg(179), note: 'campfire, bench, music ukulele' },
  { name: '08-crt-tv', lat: 17, long: 150, az: deg(150), note: 'CRT TV on crate + rocks' },
  { name: '09-rowboat', lat: 14.5, long: 210, az: deg(210), note: 'beached rowboat from the waterline' },
  { name: '10-beach-ring', lat: 19, long: 90, az: deg(90) - Math.PI / 2, note: 'along the sand ring, horizon curve' },
  { name: '11-wading-back', lat: 13, long: 60, az: deg(60), note: 'from the water: foam ring + beach' },
  { name: '12-avatar-idle', lat: 88, long: 0, az: Math.PI, note: 'avatar close-up, idling', camDist: 3 },
  { name: '13-avatar-running', lat: 60, long: 40, az: deg(40), note: 'avatar mid-run', camDist: 3.4, holdKeyMs: 700 },
]

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message))

  await page.goto(BASE + '/?e2e', { waitUntil: 'load' })
  await page.waitForSelector('canvas', { timeout: 30_000 })
  await page.waitForFunction(() => window.__store !== undefined && window.__controls !== undefined)
  await page.waitForTimeout(1200)

  // Clean shots: dismiss the intro hint and use orbit mode (no look hint).
  await page.evaluate(() => {
    const store = window.__store.getState()
    store.markMoved()
    store.setCameraMode('orbit')
  })

  for (const shot of SHOTS) {
    await page.evaluate(
      ({ lat, long, az }) => {
        window.__controls.poseOverride = { lat, long }
        window.__controls.azimuthOverride = az
      },
      shot,
    )
    await page.waitForTimeout(700) // overrides consume + a few settled frames
    if (shot.camDist) {
      await page.evaluate((d) => (window.__controls.camDist = d), shot.camDist)
      await page.waitForTimeout(250)
    }
    if (shot.holdKeyMs) {
      await page.keyboard.down('ShiftLeft')
      await page.keyboard.down('KeyW')
      await page.waitForTimeout(shot.holdKeyMs)
    }
    await page.screenshot({ path: `${OUT}/${shot.name}.png` })
    if (shot.holdKeyMs) {
      await page.keyboard.up('KeyW')
      await page.keyboard.up('ShiftLeft')
    }
    if (shot.camDist) {
      await page.evaluate(() => (window.__controls.camDist = null))
    }
    console.log(`shot ${shot.name}  (${shot.note})`)
  }

  await browser.close()
  console.log('sweep complete →', OUT)
}

main().catch((e) => {
  console.error('SWEEP CRASH:', e)
  process.exit(2)
})
