// Performance measurement at three vantage points on the production preview.
// Usage: npm run build && npm run preview  (port 4173), then:
//   node e2e/measure.mjs [--throttle N]  (N = CDP CPU throttle multiplier)
import { chromium } from '@playwright/test'

const BASE = process.env.MEASURE_URL || 'http://localhost:4173'
const throttleIdx = process.argv.indexOf('--throttle')
const THROTTLE = throttleIdx > -1 ? Number(process.argv[throttleIdx + 1]) : 1
const dsfIdx = process.argv.indexOf('--dsf')
const DSF = dsfIdx > -1 ? Number(process.argv[dsfIdx + 1]) : 1

const VANTAGES = [
  { name: 'spawn', lat: 90, long: 0, az: Math.PI },
  { name: 'mid-dock', lat: 20, long: 0, az: Math.PI },
  { name: 'night-beach', lat: 17.5, long: 179, az: (179 * Math.PI) / 180 },
]

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: DSF,
  })
  if (DSF > 1) console.log(`deviceScaleFactor ${DSF} (retina reproduction)`)
  if (THROTTLE > 1) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
    console.log(`CPU throttled ${THROTTLE}x`)
  }
  await page.goto(BASE + '/?e2e', { waitUntil: 'load' })
  await page.waitForSelector('canvas', { timeout: 30_000 })
  await page.waitForFunction(
    () => window.__store !== undefined && window.__controls !== undefined && window.__renderInfo !== undefined,
    { timeout: 15_000 },
  )
  await page.evaluate(() => window.__store.getState().markMoved())
  await page.waitForTimeout(1500)

  for (const v of VANTAGES) {
    await page.evaluate(({ lat, long, az }) => {
      window.__controls.poseOverride = { lat, long }
      window.__controls.azimuthOverride = az
    }, v)
    await page.waitForTimeout(800) // settle

    const result = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0
          const start = performance.now()
          const tick = () => {
            frames++
            if (performance.now() - start < 2500) requestAnimationFrame(tick)
            else {
              const info = window.__renderInfo()
              resolve({
                fps: Math.round((frames / (performance.now() - start)) * 1000),
                ...info,
              })
            }
          }
          requestAnimationFrame(tick)
        }),
    )
    console.log(
      `${v.name.padEnd(12)} fps=${String(result.fps).padStart(3)}  calls=${String(result.calls).padStart(4)}  tris=${result.triangles.toLocaleString()}  dpr=${result.pixelRatio}`,
    )
  }

  // Tier check: the monitor arms ~4 s after scene-ready and needs a few
  // 2.5 s evaluation rounds — park at spawn (the heaviest vantage) and give
  // throttled runs a real observation window.
  await page.evaluate(() => {
    window.__controls.poseOverride = { lat: 90, long: 0 }
    window.__controls.azimuthOverride = Math.PI
  })
  await page.waitForTimeout(THROTTLE > 1 ? 10_000 : 500)
  const tier = await page.evaluate(() => window.__store.getState().qualityTier)
  const dprNow = await page.evaluate(() => window.__renderInfo().pixelRatio)
  const pm = await page.evaluate(() => JSON.stringify(window.__pmDebug ?? null))
  console.log(`qualityTier=${tier}  dprNow=${dprNow}  monitor=${pm}`)
  await browser.close()
}

main().catch((e) => {
  console.error('MEASURE CRASH:', e)
  process.exit(2)
})
