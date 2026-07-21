// Sky white-out acceptance (CLAUDE.md v3.7): at deep day, across the
// sun-facing / side / anti-sun pans, NO sky pixel outside the sun disc/halo
// core may be near-white (low saturation at high lightness). Exits 1 on any
// violation — wire into the sweep.
// Usage: npm run build && npm run preview  (port 4173), then:
//   node e2e/skycheck.mjs
import { chromium } from '@playwright/test'

const BASE = process.env.SWEEP_URL || 'http://localhost:4173'
const deg = (d) => (d * Math.PI) / 180

// Near-white: high lightness with low saturation. Raised in v3.8 alongside
// the real-blue ramp so a pale band can never regress back in.
const LIGHTNESS_MIN = 0.8
const SATURATION_MAX = 0.16
/** Sky region: top fraction of the frame (safely above the horizon). */
const SKY_FRACTION = 0.42
/** Exclusion radius (px) around the brightest sky pixel (the disc/halo core). */
const CORE_RADIUS = 260
/** Violation tolerance: isolated pixels are noise; fail on clusters. */
const MAX_VIOLATIONS = 40

const PANS = [
  { name: 'sun-facing', az: Math.PI },
  { name: 'side', az: Math.PI / 2 },
  { name: 'anti-sun', az: 0 },
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
  for (const pan of PANS) {
    // Deep day: on the sunset beach.
    await page.evaluate(
      ({ az }) => {
        window.__controls.poseOverride = { lat: 18, long: 0 }
        window.__controls.azimuthOverride = az
      },
      { az: pan.az },
    )
    await page.waitForTimeout(900)

    // NOTE: the WebGL canvas reads back blank via drawImage (no
    // preserveDrawingBuffer) — analyze the real screenshot instead. The
    // original in-page readback made this check pass vacuously.
    const scan = async () => {
      const shot = await page.screenshot()
      const dataUrl = 'data:image/png;base64,' + shot.toString('base64')
      return page.evaluate(
        async ({ skyFraction, lightnessMin, saturationMax, coreRadius, dataUrl }) => {
          const img = new Image()
          img.src = dataUrl
          await img.decode()
          const w = img.width
          const h = Math.floor(img.height * skyFraction)
          const c2d = document.createElement('canvas')
          c2d.width = w
          c2d.height = h
          const ctx = c2d.getContext('2d')
          ctx.drawImage(img, 0, 0, w, h, 0, 0, w, h)
          const d = ctx.getImageData(0, 0, w, h).data
          // Brightest pixel = disc/halo core to exclude.
          let bx = -1, by = -1, bl = -1
          for (let y = 0; y < h; y += 4) {
            for (let x = 0; x < w; x += 4) {
              const i = (y * w + x) * 4
              const l = d[i] + d[i + 1] + d[i + 2]
              if (l > bl) { bl = l; bx = x; by = y }
            }
          }
          const keys = []
          const samples = []
          for (let y = 0; y < h; y += 2) {
            for (let x = 0; x < w; x += 2) {
              const dx = x - bx, dy = y - by
              if (dx * dx + dy * dy < coreRadius * coreRadius) continue
              const i = (y * w + x) * 4
              const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255
              const maxc = Math.max(r, g, b), minc = Math.min(r, g, b)
              const lightness = (maxc + minc) / 2
              const sat = maxc === minc ? 0 : (maxc - minc) / (1 - Math.abs(2 * lightness - 1))
              if (lightness > lightnessMin && sat < saturationMax && keys.length < 50000) {
                keys.push(y * w + x)
                if (samples.length < 5) samples.push({ x, y, r, g, b })
              }
            }
          }
          return { keys, samples, brightest: { bx, by } }
        },
        {
          skyFraction: SKY_FRACTION,
          lightnessMin: LIGHTNESS_MIN,
          saturationMax: SATURATION_MAX,
          coreRadius: CORE_RADIUS,
          dataUrl,
        },
      )
    }
    // Two-frame persistence: the sky gradient is static per pose, while
    // pale MOVERS (seagull cream, drifting cloud white) shift between
    // frames — only violations at the SAME pixel in both frames count.
    const a = await scan()
    await page.waitForTimeout(1500)
    const b = await scan()
    const bSet = new Set(b.keys)
    const persistent = a.keys.filter((k) => bSet.has(k)).length

    const ok = persistent <= MAX_VIOLATIONS
    console.log(
      `${pan.name}: ${persistent} persistent near-white sky pixels ` +
        `(${a.keys.length}/${b.keys.length} per frame; core excluded ` +
        `@${a.brightest.bx},${a.brightest.by}) → ${ok ? 'OK' : 'FAIL'}`,
    )
    if (!ok) {
      failed = true
      console.log('  samples:', JSON.stringify(a.samples))
    }
  }

  await browser.close()
  if (failed) {
    console.error('SKYCHECK FAILED: near-white sky pixels at deep day')
    process.exit(1)
  }
  console.log('skycheck passed — no near-white sky outside the disc core')
}

main().catch((e) => {
  console.error('SKYCHECK CRASH:', e)
  process.exit(2)
})
