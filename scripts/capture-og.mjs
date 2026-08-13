// OG image capture (Phase 4): renders the spawn "first sight" — sun
// over the water past the dock — at 1200×630 into public/og.png, and
// rasterizes public/favicon.svg to public/apple-touch-icon.png
// (180×180). Rerun whenever the island's look changes.
// Usage: npm run build && npm run preview (port 4173), then:
//   node scripts/capture-og.mjs
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const browser = await chromium.launch({ channel: 'chrome', headless: true })

// ---- og.png: the sunset first sight, no HUD ------------------------
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.goto('http://localhost:4173/?e2e', { waitUntil: 'load' })
await page.waitForSelector('canvas', { timeout: 30_000 })
await page.waitForFunction(() => window.__store !== undefined && window.__controls !== undefined)
await page.waitForTimeout(1500)
await page.evaluate(() => {
  const s = window.__store.getState()
  s.markMoved()
  s.setCameraMode('orbit')
  // Down the beach for depth: dock at frame left, sun low over the sea.
  window.__controls.poseOverride = { lat: 20, long: 5 }
  window.__controls.azimuthOverride = (5 * Math.PI) / 180 + Math.PI - 0.35
  window.__controls.pitchOverride = 0.12
  window.__controls.camDist = 7
})
await page.waitForTimeout(1400)
// Hide HUD chrome for a clean card.
await page.addStyleTag({ content: '.pointer-events-none.fixed, .pointer-events-auto.fixed { display: none !important }' })
await page.waitForTimeout(200)
const shot = await page.screenshot({ type: 'png' })
writeFileSync(resolve('public/og.png'), shot)
console.log(`public/og.png written (${(shot.length / 1024).toFixed(0)} KB)`)

// ---- apple-touch-icon.png from the SVG favicon ---------------------
const iconPage = await browser.newPage({ viewport: { width: 180, height: 180 } })
const svg = readFileSync(resolve('public/favicon.svg'), 'utf8')
await iconPage.setContent(
  `<style>*{margin:0}</style><div style="width:180px;height:180px">${svg.replace('<svg ', '<svg width="180" height="180" ')}</div>`,
)
await iconPage.waitForTimeout(200)
const icon = await iconPage.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 180, height: 180 } })
writeFileSync(resolve('public/apple-touch-icon.png'), icon)
console.log(`public/apple-touch-icon.png written (${(icon.length / 1024).toFixed(0)} KB)`)
await browser.close()
