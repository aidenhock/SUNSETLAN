// Celestial set-floor acceptance (CLAUDE.md v3.10): at the waterline AND at
// the wading movement clamp, facing each body, the visible disc fraction
// must stay ≥ ~55%, and the glitter lane must be present whenever the disc
// is visible. Samples rendered frames in-browser; exits 1 on violation.
// Usage: npm run build && npm run preview  (port 4173), then:
//   node e2e/setcheck.mjs
import { chromium } from '@playwright/test'

const BASE = process.env.SWEEP_URL || 'http://localhost:4173'
const deg = (d) => (d * Math.PI) / 180

const FRACTION_MIN = 0.5 // floor 0.575 minus sampling tolerance
const LANE_MARGIN = 0.012 // lane strip must beat the control strip by this

const SPOTS = [
  { name: 'day-waterline', lat: 15, long: 0, az: Math.PI, disc: 'sun' },
  { name: 'day-wading', lat: 12.6, long: 0, az: Math.PI, disc: 'sun' },
  { name: 'night-waterline', lat: 15.5, long: 180, az: deg(180) + Math.PI, disc: 'moon' },
  { name: 'night-wading', lat: 13, long: 180, az: deg(180) + Math.PI, disc: 'moon' },
]

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto(BASE + '/?e2e', { waitUntil: 'load' })
  await page.waitForSelector('canvas', { timeout: 30_000 })
  await page.waitForFunction(() => window.__store !== undefined && window.__controls !== undefined)
  await page.waitForTimeout(1200)
  await page.evaluate(() => {
    const store = window.__store.getState()
    store.markMoved()
    store.setCameraMode('orbit')
  })

  let failed = false
  for (const spot of SPOTS) {
    await page.evaluate(
      ({ lat, long, az }) => {
        window.__controls.poseOverride = { lat, long }
        window.__controls.azimuthOverride = az
      },
      spot,
    )
    await page.waitForTimeout(2400) // let the 0.6 s arc smoothing settle

    // NOTE: the WebGL canvas cannot be sampled via drawImage (cleared
    // buffer without preserveDrawingBuffer) — analyze the real screenshot,
    // decoded back in-page through an <img>.
    const shot = await page.screenshot()
    const dataUrl = 'data:image/png;base64,' + shot.toString('base64')
    const r = await page.evaluate(
      async ({ disc, dataUrl }) => {
        const img = new Image()
        img.src = dataUrl
        await img.decode()
        const w = img.width
        const h = img.height
        const c2d = document.createElement('canvas')
        c2d.width = w
        c2d.height = h
        const ctx = c2d.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const d = ctx.getImageData(0, 0, w, h).data
        // Disc pixels: the brightest near-uniform core (sun warm-white,
        // moon pale). Scan the upper 70% of the frame.
        const isDisc = (i) => {
          const r8 = d[i] / 255, g8 = d[i + 1] / 255, b8 = d[i + 2] / 255
          return disc === 'sun'
            ? r8 > 0.95 && g8 > 0.87 && b8 > 0.6
            : r8 > 0.85 && g8 > 0.83 && b8 > 0.75
        }
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, count = 0
        for (let y = 0; y < h * 0.7; y += 2) {
          for (let x = 0; x < w; x += 2) {
            if (isDisc((y * w + x) * 4)) {
              count++
              if (x < minX) minX = x
              if (x > maxX) maxX = x
              if (y < minY) minY = y
              if (y > maxY) maxY = y
            }
          }
        }
        if (count < 30) return { found: false }
        const fullRadius = (maxX - minX) / 2 // widest chord = true diameter
        const visibleHeight = maxY - minY
        const fraction = Math.min(visibleHeight / (2 * fullRadius), 1)
        // v3.11 lane geometry: sample rows just below the disc base. Lane
        // pixels = notably brighter than their row median. The lane must be
        // at least as wide as the disc AND touch the disc's base (no gap).
        const cx2 = Math.floor((minX + maxX) / 2)
        const laneWidthAt = (y) => {
          const lum = []
          const x0 = Math.max(0, cx2 - 420)
          const x1 = Math.min(w, cx2 + 420)
          for (let x = x0; x < x1; x += 2) {
            const i = (y * w + x) * 4
            lum.push((d[i] + d[i + 1] + d[i + 2]) / 765)
          }
          const sorted = [...lum].sort((a, b) => a - b)
          const median = sorted[Math.floor(sorted.length / 2)]
          let best = 0
          let run = 0
          for (const l of lum) {
            if (l > median + 0.045) {
              run += 2
              if (run > best) best = run
            } else run = 0
          }
          return best
        }
        let laneMaxWidth = 0
        for (let y = maxY + 8; y < Math.min(maxY + 46, h - 1); y += 4) {
          laneMaxWidth = Math.max(laneMaxWidth, laneWidthAt(y))
        }
        let touchWidth = 0
        for (let y = maxY + 1; y < Math.min(maxY + 12, h - 1); y += 2) {
          touchWidth = Math.max(touchWidth, laneWidthAt(y))
        }
        // Glitter lane: brightness of the strip under the disc vs a control
        // strip offset to the side, both in the water region below maxY.
        const cx = (minX + maxX) / 2
        const strip = (x0) => {
          let sum = 0, n = 0
          for (let y = Math.min(maxY + 30, h - 1); y < Math.min(maxY + 220, h); y += 3) {
            for (let x = Math.max(0, x0 - 40); x < Math.min(w, x0 + 40); x += 3) {
              const i = (Math.floor(y) * w + Math.floor(x)) * 4
              sum += (d[i] + d[i + 1] + d[i + 2]) / 765
              n++
            }
          }
          return n ? sum / n : 0
        }
        const lane = strip(cx)
        const control = (strip(cx - 340) + strip(cx + 340)) / 2
        return {
          found: true,
          fraction,
          lane,
          control,
          count,
          discWidth: maxX - minX,
          laneMaxWidth,
          touchWidth,
        }
      },
      { disc: spot.disc, dataUrl },
    )

    if (!r.found) {
      console.log(`${spot.name}: DISC NOT FOUND → FAIL`)
      failed = true
      continue
    }
    const fracOk = r.fraction >= FRACTION_MIN
    const laneOk = r.lane - r.control >= LANE_MARGIN
    // v3.11: lane at least disc-wide just below the limb, flush to the base.
    const widthOk = r.laneMaxWidth >= r.discWidth * 0.9
    const touchOk = r.touchWidth > r.discWidth * 0.3
    console.log(
      `${spot.name}: fraction ${(r.fraction * 100).toFixed(0)}% (${fracOk ? 'OK' : 'FAIL'}); ` +
        `lane ${r.lane.toFixed(3)} vs ${r.control.toFixed(3)} (${laneOk ? 'OK' : 'FAIL'}); ` +
        `width ${r.laneMaxWidth}px vs disc ${r.discWidth}px (${widthOk ? 'OK' : 'FAIL'}); ` +
        `base-touch ${r.touchWidth}px (${touchOk ? 'OK' : 'FAIL'})`,
    )
    if (!fracOk || !laneOk || !widthOk || !touchOk) failed = true
  }

  await browser.close()
  if (failed) {
    console.error('SETCHECK FAILED')
    process.exit(1)
  }
  console.log('setcheck passed — floor and glitter hold at the shore, both sides')
}

main().catch((e) => {
  console.error('SETCHECK CRASH:', e)
  process.exit(2)
})
