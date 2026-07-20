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
          const rowMax = sorted[sorted.length - 1]
          // Core-lane threshold: 75% of the way from median to row max —
          // the lane core is distinctly brighter than the broad moonlit
          // sheen, soft wedge edges, and glow bleed.
          const thresh = median + Math.max(0.045, 0.75 * (rowMax - median))
          let best = 0
          let run = 0
          for (const l of lum) {
            if (l > thresh) {
              run += 2
              if (run > best) best = run
            } else run = 0
          }
          return best
        }
        // Sample below the disc-glow junction at the water line (the halo
        // meeting the water is legitimately bright and wide).
        let laneMaxWidth = 0
        for (let y = maxY + 16; y < Math.min(maxY + 42, h - 1); y += 4) {
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
    // v3.12: apex band — just below the limb the wedge must match the
    // disc's GEOMETRIC width. The disc detector under-measures (bright core
    // only, soft rim excluded) by ~25%, so the band allows up to 1.8× of
    // the measured width while still catching a doubled/spread apex.
    const widthOk = r.laneMaxWidth >= r.discWidth * 0.9 && r.laneMaxWidth <= r.discWidth * 1.8
    const touchOk = r.touchWidth > r.discWidth * 0.3
    console.log(
      `${spot.name}: fraction ${(r.fraction * 100).toFixed(0)}% (${fracOk ? 'OK' : 'FAIL'}); ` +
        `lane ${r.lane.toFixed(3)} vs ${r.control.toFixed(3)} (${laneOk ? 'OK' : 'FAIL'}); ` +
        `width ${r.laneMaxWidth}px vs disc ${r.discWidth}px (${widthOk ? 'OK' : 'FAIL'}); ` +
        `base-touch ${r.touchWidth}px (${touchOk ? 'OK' : 'FAIL'})`,
    )
    if (!fracOk || !laneOk || !widthOk || !touchOk) failed = true
  }

  // Shared frame analyzer: decode the screenshot and measure lane-vs-control
  // luminance over an explicit pixel region (probe-calibrated per pose).
  const regionStats = async (cfg) => {
    const shot = await page.screenshot()
    const dataUrl = 'data:image/png;base64,' + shot.toString('base64')
    return page.evaluate(async ({ cfg, dataUrl }) => {
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
      const lumAt = (x, y) => {
        const i = (y * w + x) * 4
        return (d[i] + d[i + 1] + d[i + 2]) / 765
      }
      if (cfg.mode === 'laneVsControl') {
        // Per water row: max luminance inside the lane window vs inside the
        // control window (open sea to the side). Continuity = fraction of
        // rows where the lane clearly wins.
        let rows = 0, bright = 0, laneSum = 0, ctrlSum = 0
        for (let y = cfg.y0; y <= cfg.y1; y += 3) {
          let lane = 0
          for (let x = cfg.laneX0; x < cfg.laneX1; x += 2) lane = Math.max(lane, lumAt(x, y))
          let ctrl = 0
          for (let x = cfg.ctrlX0; x < cfg.ctrlX1; x += 2) ctrl = Math.max(ctrl, lumAt(x, y))
          rows++
          laneSum += lane
          ctrlSum += ctrl
          if (lane > ctrl + 0.03) bright++
        }
        return { continuity: bright / rows, laneMean: laneSum / rows, ctrlMean: ctrlSum / rows }
      }
      // mode 'noCore': widest contiguous bright run of the BODY'S OWN TINT
      // (vs row median) across the water bands — a real lane at waterline
      // height measures 70px+, so any run under the cap is foam/facet
      // noise. Color-gating matters: once one body sets, the OTHER may
      // legitimately rise near the antipode with its own lane (warm sun
      // vs cool moon), and the avatar's warm-lit head sits mid-frame.
      const tintAt = (x, y) => {
        const i = (y * w + x) * 4
        return (d[i] - d[i + 2]) / 255 // r − b: warm > 0 > cool
      }
      let widest = 0
      for (let y = cfg.y0; y <= cfg.y1; y += 6) {
        const cols = []
        for (const [x0, x1] of cfg.bands) {
          for (let x = x0; x < x1; x += 2) {
            cols.push([lumAt(x, y), tintAt(x, y)])
          }
        }
        const sorted = cols.map((c) => c[0]).sort((a, b) => a - b)
        const median = sorted[Math.floor(sorted.length / 2)]
        let run = 0
        for (const [l, t] of cols) {
          const tintOk = cfg.tint === 'warm' ? t > 0.04 : t < -0.02
          if (l > median + 0.05 && tintOk) {
            run += 2
            if (run > widest) widest = run
          } else run = 0
        }
      }
      return { widest }
    }, { cfg, dataUrl })
  }

  // v3.12 (b): risen body — the lane must cross ALL visible open water
  // toward the body. From mid-island (lat 22) the planet's bulge hides the
  // near water, so the visible sea is the band under the limb; the poses
  // sit 12° off the home meridians so the dock stays out of the corridor.
  // Windows calibrated from probe-risen-day2/night2 (deterministic pose +
  // viewport): lane patch x≈400–540, open-sea control to the right, sea
  // band rows ≈342–371.
  const RISEN = [
    { name: 'day-risen', lat: 22, long: 348, az: deg(348) + Math.PI },
    { name: 'night-risen', lat: 22, long: 168, az: deg(168) + Math.PI },
  ]
  for (const spot of RISEN) {
    await page.evaluate(
      ({ lat, long, az }) => {
        window.__controls.poseOverride = { lat, long }
        window.__controls.azimuthOverride = az
      },
      spot,
    )
    await page.waitForTimeout(2400)
    const r = await regionStats({
      mode: 'laneVsControl',
      y0: 342, y1: 371,
      laneX0: 400, laneX1: 540,
      ctrlX0: 660, ctrlX1: 880,
    })
    const ok = r.continuity >= 0.7 && r.laneMean - r.ctrlMean >= 0.02
    console.log(
      `${spot.name}: lane continuity ${(r.continuity * 100).toFixed(0)}% of water rows, ` +
        `mean ${r.laneMean.toFixed(3)} vs ${r.ctrlMean.toFixed(3)} → ${ok ? 'OK' : 'FAIL'}`,
    )
    if (!ok) failed = true
  }

  // v3.12 (c): walk-away set — the body's own lane is absent once its gate
  // is dead. The lockstep monotone fade itself is asserted in vitest
  // against the gate math (deterministic); pixels assert final absence
  // from the waterline facing straight out (sea fills mid-frame). Regions
  // hug the sea bulge (sky at the sides excluded) and skip the avatar
  // column; tint-gating keeps the OTHER body's legitimate lane out.
  for (const end of [
    { name: 'moon-walkaway', lat: 15, long: 90, tint: 'cool' },
    { name: 'sun-walkaway', lat: 15, long: 128, tint: 'warm' },
  ]) {
    await page.evaluate(
      ({ lat, long, az }) => {
        window.__controls.poseOverride = { lat, long }
        window.__controls.azimuthOverride = az
      },
      { lat: end.lat, long: end.long, az: deg(end.long) + Math.PI },
    )
    await page.waitForTimeout(2400)
    const r = await regionStats({
      mode: 'noCore',
      tint: end.tint,
      bands: [[400, 575], [705, 880]],
      y0: 351,
      y1: 470,
    })
    const ok = r.widest < 34
    console.log(
      `${end.name}: own lane absent once submerged (widest ${end.tint} run ${r.widest}px) → ${ok ? 'OK' : 'FAIL'}`,
    )
    if (!ok) failed = true
  }

  await browser.close()
  if (failed) {
    console.error('SETCHECK FAILED')
    process.exit(1)
  }
  console.log('setcheck passed — wedge, floor, continuity, and lockstep fade hold')
}

main().catch((e) => {
  console.error('SETCHECK CRASH:', e)
  process.exit(2)
})
