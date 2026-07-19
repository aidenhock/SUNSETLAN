// Crossfade continuity check (CLAUDE.md 3B acceptance: "walking long 0 → 180
// crossfades the whole mood with no popping"). Captures frames at even
// longitude steps along the sand ring, facing east (the walking direction),
// so adjacent frames can be compared for smooth fog/light/sky progression.
// Usage: npm run build && npm run preview  (port 4173), then:
//   node e2e/crossfade.mjs [outputDir]
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.SWEEP_URL || 'http://localhost:4173'
const args = process.argv.slice(2).filter((a) => a !== '--reverse')
const REVERSE = process.argv.includes('--reverse') // walk 180 → 0, facing west
const OUT = resolve(args[0] || (REVERSE ? 'crossfade-back-shots' : 'crossfade-shots'))
const deg = (d) => (d * Math.PI) / 180

const LAT = 20
const STEP = 15 // 0, 15, ..., 180

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message))

  await page.goto(BASE + '/?e2e', { waitUntil: 'load' })
  await page.waitForSelector('canvas', { timeout: 30_000 })
  await page.waitForFunction(() => window.__store !== undefined && window.__controls !== undefined)
  await page.waitForTimeout(1200)
  await page.evaluate(() => {
    const store = window.__store.getState()
    store.markMoved()
    store.setCameraMode('orbit')
  })

  for (let i = 0; i <= 180; i += STEP) {
    const long = REVERSE ? 180 - i : i
    // Face the walking direction: east on the way out, west on the way back.
    const az = deg(long) + (REVERSE ? Math.PI / 2 : -Math.PI / 2)
    await page.evaluate(
      ({ lat, long, az }) => {
        window.__controls.poseOverride = { lat, long }
        window.__controls.azimuthOverride = az
      },
      { lat: LAT, long, az },
    )
    await page.waitForTimeout(600)
    const name = `crossfade-${REVERSE ? 'back-' : ''}${String(long).padStart(3, '0')}`
    await page.screenshot({ path: `${OUT}/${name}.png` })
    console.log(`shot ${name}`)
  }

  await browser.close()
  console.log('crossfade walk complete →', OUT)
}

main().catch((e) => {
  console.error('CROSSFADE CRASH:', e)
  process.exit(2)
})
