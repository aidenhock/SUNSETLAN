/**
 * Captures the screenshots hung on the build-log room's walls.
 *
 * Each mural in src/content/murals.ts gets one shot from a fixed
 * vantage, written to public/murals/<id>.jpg. Rerun it whenever the
 * world's look changes and the room updates itself:
 *
 *   npm run build && npx vite preview --port 4173
 *   node scripts/capture-murals.mjs
 *
 * Same headless-Chromium approach as the other scripts here — no new
 * dependencies. The HUD is hidden for every shot except the minimap's.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.PREVIEW_URL ?? 'http://localhost:4173'
const OUT = 'public/murals'

/** lat/long/azimuth per mural id; `pitch` and `dist` are optional. */
const SHOTS = [
  { id: 'fixed-pole', lat: 90, long: 0, az: Math.PI, dist: 9, pitch: 0.3 },
  { id: 'two-skies', lat: 30, long: 300, az: Math.PI * 1.4, pitch: 0.05 },
  { id: 'celestial-arc', lat: 17, long: 0, az: Math.PI, pitch: 0.08 },
  { id: 'glitter', lat: 15.5, long: 0, az: Math.PI, pitch: 0.02 },
  { id: 'character-rig', lat: 60, long: 200, az: 0, dist: 3.2, pitch: 0.25 },
  { id: 'audio', lat: 20, long: 359, az: Math.PI, dist: 5, pitch: 0.3 },
  { id: 'memorial-garden', lat: 42, long: 107, az: 0, dist: 8, pitch: 0.35, night: true },
  { id: 'minimap', lat: 45, long: 20, az: 0, hud: true },
  { id: 'hedge-stone', lat: 47, long: 300, az: 0, dist: 6, pitch: 0.25 },
  { id: 'one-terrain', lat: 22, long: 60, az: Math.PI, pitch: 0.15 },
  { id: 'bulletin-board', lat: 42, long: 343, az: 0, dist: 5, pitch: 0.25 },
  { id: 'budgets', lat: 35, long: 180, az: Math.PI, dist: 14, pitch: 0.4, night: true },
]

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto(`${BASE}/?e2e`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__controls !== undefined, undefined, { timeout: 30000 })
await page.waitForTimeout(2000)

for (const shot of SHOTS) {
  await page.evaluate((s) => {
    const c = window.__controls
    c.poseOverride = { lat: s.lat, long: s.long }
    c.azimuthOverride = s.az
    c.pitchOverride = s.pitch ?? 0.35
    c.camDist = s.dist ?? null
    if (s.night) window.__nightMixOverride = 1
    else delete window.__nightMixOverride
    // Clean plate: the HUD is chrome, not the feature (except the map).
    const style = document.getElementById('mural-clean') ?? document.createElement('style')
    style.id = 'mural-clean'
    style.textContent = s.hud
      ? ''
      : 'div.inset-0.z-30{display:none !important}[data-minimap]{display:none !important}'
    document.head.appendChild(style)
  }, shot)
  await page.waitForTimeout(1400)
  await page.screenshot({ path: `${OUT}/${shot.id}.jpg`, type: 'jpeg', quality: 78 })
  console.log(`${shot.id}.jpg`)
}

await page.evaluate(() => {
  window.__controls.camDist = null
  delete window.__nightMixOverride
})
await browser.close()
console.log(`\n${SHOTS.length} murals → ${OUT}/`)
