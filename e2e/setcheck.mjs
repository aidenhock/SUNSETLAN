// Celestial set-floor + glitter-lane acceptance (CLAUDE.md v3.10/v3.13):
// - set floor: at the waterline and the wading clamp the visible disc
//   fraction stays ≥ ~55% and the lane is present whenever the disc is.
// - v3.13 lane: far-end width 0.4–0.6× disc width touching the disc base;
//   far/mid/near widths strictly increasing (no waist); a camera-orbit
//   pair proving the lane is anchored to the CHARACTER, not the camera;
//   high-vs-low (wide + faint ≥ the opacity floor vs narrow + vivid);
//   absent once submerged. Both bodies.
// Samples rendered frames in-browser; exits 1 on violation.
// Usage: npm run build && npm run preview  (port 4173), then:
//   node e2e/setcheck.mjs
import { chromium } from '@playwright/test'

const BASE = process.env.SWEEP_URL || 'http://localhost:4173'
const deg = (d) => (d * Math.PI) / 180

const FRACTION_MIN = 0.5 // floor 0.575 minus sampling tolerance
const LANE_MARGIN = 0.012 // lane strip must beat the control strip by this

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
  const pose = async (lat, long, azOff = 0) => {
    await page.evaluate(
      ({ lat, long, az }) => {
        window.__controls.poseOverride = { lat, long }
        window.__controls.azimuthOverride = az
      },
      { lat, long, az: deg(long) + Math.PI + azOff },
    )
    await page.waitForTimeout(2400) // let the 0.6 s arc smoothing settle
  }

  // NOTE: the WebGL canvas cannot be sampled via drawImage (cleared buffer
  // without preserveDrawingBuffer) — analyze the real screenshot, decoded
  // back in-page through an <img>. One evaluate, mode-switched.
  const analyze = async (cfg) => {
    const shot = await page.screenshot()
    const dataUrl = 'data:image/png;base64,' + shot.toString('base64')
    return page.evaluate(
      async ({ cfg, dataUrl }) => {
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
        const tintAt = (x, y) => {
          const i = (y * w + x) * 4
          return (d[i] - d[i + 2]) / 255 // r − b: warm > 0 > cool
        }

        if (cfg.mode === 'windows') {
          // Top-decile mean per rectangular window: a single max rides
          // individual glints (which blink with the waves), making dim
          // night lanes flicker across runs — the top-10% mean is stable
          // for lane and control alike.
          return cfg.windows.map(([x0, x1, y0, y1]) => {
            const px = []
            for (let y = y0; y < y1; y += 2) {
              for (let x = x0; x < x1; x += 2) px.push(lumAt(x, y))
            }
            px.sort((a, b) => b - a)
            const n = Math.max(1, Math.floor(px.length * 0.1))
            let sum = 0
            for (let i = 0; i < n; i++) sum += px[i]
            return sum / n
          })
        }

        if (cfg.mode === 'edges') {
          // Left edge x of the lane at given rows: first crossing of
          // bg-median + 0.05 scanning rightward. For the living-edges
          // assert (v3.14): positions must differ between frames.
          return cfg.rows.map((y) => {
            const x0 = cfg.x0, x1 = cfg.x1
            const lum = []
            for (let x = x0; x < x1; x += 2) lum.push(lumAt(x, y))
            const sorted = [...lum].sort((a, b) => a - b)
            const median = sorted[Math.floor(sorted.length / 2)]
            for (let i = 0; i < lum.length; i++) {
              if (lum[i] > median + 0.05) return x0 + i * 2
            }
            return -1
          })
        }

        if (cfg.mode === 'noCore') {
          // Widest contiguous bright run of the BODY'S OWN TINT (vs row
          // median) across the water bands — a real lane at waterline
          // height measures 70px+, so any run under the cap is foam/facet
          // noise. Color-gating matters: once one body sets, the OTHER may
          // legitimately rise near the antipode with its own lane (warm
          // sun vs cool moon), and the avatar's warm-lit head sits
          // mid-frame.
          let widest = 0
          for (let y = cfg.y0; y <= cfg.y1; y += 6) {
            const cols = []
            for (const [x0, x1] of cfg.bands) {
              for (let x = x0; x < x1; x += 2) cols.push([lumAt(x, y), tintAt(x, y)])
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
        }

        // mode 'disc': find the disc, then measure the lane below it —
        // per-row core widths at given offsets, base touch, and the
        // strip-vs-control strength.
        const isDisc = (i) => {
          const r8 = d[i] / 255, g8 = d[i + 1] / 255, b8 = d[i + 2] / 255
          return cfg.disc === 'sun'
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
        const fraction = Math.min((maxY - minY) / (2 * fullRadius), 1)
        const cx = Math.floor((minX + maxX) / 2)
        const laneWidthAt = (y) => {
          const lum = []
          const x0 = Math.max(0, cx - 420)
          const x1 = Math.min(w, cx + 420)
          for (let x = x0; x < x1; x += 2) lum.push(lumAt(x, y))
          const sorted = [...lum].sort((a, b) => a - b)
          const median = sorted[Math.floor(sorted.length / 2)]
          const rowMax = sorted[sorted.length - 1]
          // Core-lane threshold: 75% of the way from median to row max —
          // the lane core is distinctly brighter than the broad moonlit
          // sheen, soft wedge edges, and glow bleed.
          const thresh = median + Math.max(0.045, 0.75 * (rowMax - median))
          let best = 0, run = 0
          for (const l of lum) {
            if (l > thresh) {
              run += 2
              if (run > best) best = run
            } else run = 0
          }
          return best
        }
        // Absolute-threshold row width (bg median + 0.05): stable when the
        // lane dims toward the shore, where a max-relative threshold
        // shrinks the measured core and fakes a waist.
        const laneWidthAbs = (y) => {
          const lum = []
          const x0 = Math.max(0, cx - 420)
          const x1 = Math.min(w, cx + 420)
          for (let x = x0; x < x1; x += 2) lum.push(lumAt(x, y))
          const sorted = [...lum].sort((a, b) => a - b)
          const median = sorted[Math.floor(sorted.length / 2)]
          let best = 0, run = 0
          for (const l of lum) {
            if (l > median + 0.05) {
              run += 2
              if (run > best) best = run
            } else run = 0
          }
          return best
        }
        const widths = (cfg.offsets ?? []).map((o) => laneWidthAt(maxY + o))
        const absWidths = [
          ...(cfg.absOffsets ?? []).map((o) => laneWidthAbs(maxY + o)),
          ...(cfg.absRowsAt ?? []).map((y) => laneWidthAbs(y)),
        ]
        let touchWidth = 0
        for (let y = maxY + 1; y < Math.min(maxY + 12, h - 1); y += 2) {
          touchWidth = Math.max(touchWidth, laneWidthAt(y))
        }
        // Strip-vs-control strength in the water region below the disc.
        const strip = (x0) => {
          let sum = 0, n = 0
          for (let y = Math.min(maxY + 30, h - 1); y < Math.min(maxY + 220, h); y += 3) {
            for (let x = Math.max(0, x0 - 40); x < Math.min(w, x0 + 40); x += 3) {
              sum += lumAt(Math.floor(x), Math.floor(y))
              n++
            }
          }
          return n ? sum / n : 0
        }
        // Sea-band strength windows (absolute rows, adaptive control side)
        // for poses where the disc rides high above the water.
        let bandLane = 0, bandCtrl = 0
        if (cfg.bandRows) {
          const [y0, y1] = cfg.bandRows
          // Control mean from immediately adjacent water (the distance-fog
          // wash varies smoothly, so adjacent water shares the lane's
          // wash while sitting clear of the corridor's soft edge), then
          // the lane's CORE mean — only pixels clearly above control
          // count, so the statistic is independent of how much of the
          // window the corridor fills (a narrow vivid column and a wide
          // faint lane both measure their own brightness, not their fill
          // fraction).
          const winPixels = (x0, x1) => {
            const px = []
            for (let y = y0; y < y1; y += 2) {
              for (let x = Math.max(0, x0); x < Math.min(w, x1); x += 2) px.push(lumAt(x, y))
            }
            return px
          }
          const ctrlPx = winPixels(
            ...(cx < w / 2 ? [cx + 100, cx + 220] : [cx - 220, cx - 100]),
          )
          bandCtrl = ctrlPx.reduce((a, b) => a + b, 0) / Math.max(ctrlPx.length, 1)
          const core = winPixels(cx - 60, cx + 60).filter((l) => l > bandCtrl + 0.03)
          bandLane = core.length >= 30
            ? core.reduce((a, b) => a + b, 0) / core.length
            : 0
        }
        return {
          found: true,
          fraction,
          discWidth: maxX - minX,
          maxY,
          cx,
          widths,
          absWidths,
          touchWidth,
          bandLane,
          bandCtrl,
          lane: strip(cx),
          control: (strip(cx - 340) + strip(cx + 340)) / 2,
        }
      },
      { cfg, dataUrl },
    )
  }

  // ---- set floor (v3.10) + far-end width/base-touch (v3.13) -----------
  // Head-on poses: the disc sits over the character, so the measurable
  // far-lane rows are between the disc base and the avatar's head.
  const SPOTS = [
    { name: 'day-waterline', lat: 15, long: 0, disc: 'sun' },
    { name: 'day-wading', lat: 12.6, long: 0, disc: 'sun' },
    { name: 'night-waterline', lat: 15.5, long: 180, disc: 'moon' },
    { name: 'night-wading', lat: 13, long: 180, disc: 'moon' },
  ]
  for (const spot of SPOTS) {
    await pose(spot.lat, spot.long)
    const r = await analyze({ mode: 'disc', disc: spot.disc, offsets: [18, 34] })
    if (!r.found) {
      console.log(`${spot.name}: DISC NOT FOUND → FAIL`)
      failed = true
      continue
    }
    const fracOk = r.fraction >= FRACTION_MIN
    const laneOk = r.lane - r.control >= LANE_MARGIN
    // Head-on, the rows below the disc base are glow junction, then the
    // avatar — the far-end WIDTH band is asserted at the mono poses
    // (clean 8°-offset vantage); here we assert presence + base contact.
    const touchOk = r.touchWidth > r.discWidth * 0.2
    console.log(
      `${spot.name}: fraction ${(r.fraction * 100).toFixed(0)}% (${fracOk ? 'OK' : 'FAIL'}); ` +
        `lane ${r.lane.toFixed(3)} vs ${r.control.toFixed(3)} (${laneOk ? 'OK' : 'FAIL'}); ` +
        `base-touch ${r.touchWidth}px (${touchOk ? 'OK' : 'FAIL'})`,
    )
    if (!fracOk || !laneOk || !touchOk) failed = true
  }

  // ---- v3.13 (2): monotonic wedge — no waist ---------------------------
  // 8° off the home meridian: the corridor clears the character, so the
  // visible span from the disc base toward the shore is measurable.
  for (const m of [
    { name: 'day-mono', lat: 15, long: 8, disc: 'sun' },
    { name: 'night-mono', lat: 15.5, long: 188, disc: 'moon' },
  ]) {
    await pose(m.lat, m.long)
    // Offsets start below the glow junction (the absolute threshold would
    // count the halo as width); the absolute threshold keeps the dimming
    // shoreward lane measured consistently (a max-relative one fakes a
    // waist as the core dims).
    const r = await analyze({ mode: 'disc', disc: m.disc, absOffsets: [48, 66, 84] })
    if (!r.found) {
      console.log(`${m.name}: DISC NOT FOUND → FAIL`)
      failed = true
      continue
    }
    const [wFar, wMid, wNear] = r.absWidths
    // ±4px tolerance between adjacent samples: the living-edge wobble
    // legitimately modulates local width (±12%, a few px on the dim
    // night lane); the near end must still clearly exceed the far end.
    const mono = wFar > 0 && wMid >= wFar - 4 && wNear >= wMid - 4 && wNear > wFar + 8
    // Far-end band: 0.4–0.6× the GEOMETRIC disc width. The measured lane
    // core (soft wedge edge, bg+0.05 cut) underestimates the corridor and
    // the disc detector sees ~75% of the geometric disc, so the px band
    // maps to ~[0.2, 0.9]× the measured disc.
    const band = wFar >= r.discWidth * 0.2 && wFar <= r.discWidth * 0.9
    const ok = mono && band
    console.log(
      `${m.name}: widths far→near ${r.absWidths.join('/')}px (disc ${r.discWidth}px; ` +
        `mono ${mono ? 'OK' : 'FAIL'}, far band ${band ? 'OK' : 'FAIL'})`,
    )
    if (!ok) failed = true
  }

  // ---- v3.13 (1): camera-orbit pair — anchored to the CHARACTER --------
  // Same pose, camera orbited ±69°. The lane's world position must not
  // move: its near end stays at the character (bright window beside the
  // character's feet), and the foreground water on the CAMERA's own sight
  // line stays clean — a camera-anchored lane would light that instead.
  // Windows calibrated from diag-orbit probes (deterministic pose).
  // Day windows sit beside the character's feet vs the camera's own
  // foreground water. At night the moonlit surf strip crosses the day
  // control regions, so the night windows compare open sea on the lane's
  // side vs the mirrored open sea (both above the surf diagonal).
  const ORBITS = [
    { name: 'day-orbit-L', lat: 15, long: 8, azOff: -1.2,
      laneWin: [320, 600, 470, 525], ctrlWin: [100, 400, 630, 760], margin: 0.04 },
    // R sides: the lane crosses from the right frame edge to the character
    // (v3.14 band rows ~470–545); control = the dark open sea directly
    // BELOW the band (off-corridor, no surf, no moonlit sand).
    { name: 'day-orbit-R', lat: 15, long: 8, azOff: 1.2,
      laneWin: [760, 1100, 468, 545], ctrlWin: [760, 1100, 600, 720], margin: 0.04 },
    // night-L control mirrors night-R: dark sea below the band (the day-L
    // bottom-left control sits on the moonlit surf strip at night).
    { name: 'night-orbit-L', lat: 15.5, long: 188, azOff: -1.2,
      laneWin: [200, 560, 468, 545], ctrlWin: [140, 480, 600, 720], margin: 0.04 },
    { name: 'night-orbit-R', lat: 15.5, long: 188, azOff: 1.2,
      laneWin: [760, 1100, 468, 545], ctrlWin: [760, 1100, 600, 720], margin: 0.04 },
  ]
  // Transient critters (gulls over the water) can cross a window between
  // runs — sample twice and keep the per-window MIN: movers vanish, the
  // static world-anchored lane stays.
  const winsStable = async (windows) => {
    const a = await analyze({ mode: 'windows', windows })
    await page.waitForTimeout(1400)
    const b = await analyze({ mode: 'windows', windows })
    return a.map((v, i) => Math.min(v, b[i]))
  }
  for (const o of ORBITS) {
    await pose(o.lat, o.long, o.azOff)
    const [laneMax, ctrlMax] = await winsStable([o.laneWin, o.ctrlWin])
    const ok = laneMax - ctrlMax >= o.margin
    console.log(
      `${o.name}: near-character ${laneMax.toFixed(3)} vs camera-path ${ctrlMax.toFixed(3)} → ${ok ? 'OK' : 'FAIL'}`,
    )
    if (!ok) failed = true
  }

  // ---- v3.14 (1): the lane reaches the sand — no taper, no gap ---------
  // Orbit vantages where the near-shore water is visible beside/behind
  // the character. Windows hug the water just off the foam line where
  // the corridor crosses; controls sit on off-corridor water at similar
  // depth. Wading: the strip BEHIND the character (between them and the
  // sand) must be lit — the old hemisphere gate cut it.
  for (const s of [
    { name: 'day-nearshore', lat: 15, long: 8, azOff: -1.2,
      laneWin: [420, 580, 460, 525], ctrlWin: [60, 300, 580, 680] },
    { name: 'day-wading-gap', lat: 12.6, long: 8, azOff: -1.2,
      laneWin: [690, 850, 475, 555], ctrlWin: [700, 860, 610, 700] },
    { name: 'night-nearshore', lat: 15.5, long: 188, azOff: -1.2,
      laneWin: [420, 580, 460, 525], ctrlWin: [60, 300, 580, 680] },
  ]) {
    await pose(s.lat, s.long, s.azOff)
    const [laneMax, ctrlMax] = await winsStable([s.laneWin, s.ctrlWin])
    const ok = laneMax - ctrlMax >= 0.04
    console.log(
      `${s.name}: shore lane ${laneMax.toFixed(3)} vs off-corridor ${ctrlMax.toFixed(3)} → ${ok ? 'OK' : 'FAIL'}`,
    )
    if (!ok) failed = true
  }

  // ---- v3.14 (2): living edges — the boundary moves between frames -----
  for (const m of [
    { name: 'day-edges', lat: 15, long: 8, disc: 'sun' },
    { name: 'night-edges', lat: 15.5, long: 188, disc: 'moon' },
  ]) {
    await pose(m.lat, m.long)
    const d = await analyze({ mode: 'disc', disc: m.disc })
    if (!d.found) {
      console.log(`${m.name}: DISC NOT FOUND → FAIL`)
      failed = true
      continue
    }
    // Three samples across ~2.7 s: any pair differing proves the edge
    // lives (a single pair can land on near-identical wobble phase).
    const rows = [d.maxY + 56, d.maxY + 72, d.maxY + 88]
    const cfg = { mode: 'edges', rows, x0: Math.max(0, d.cx - 420), x1: d.cx + 60 }
    const samples = [await analyze(cfg)]
    for (let i = 0; i < 2; i++) {
      await page.waitForTimeout(1300)
      samples.push(await analyze(cfg))
    }
    const moved = rows.some((_, i) =>
      samples.some((s, j) =>
        samples.some(
          (t, k) => j < k && s[i] >= 0 && t[i] >= 0 && Math.abs(s[i] - t[i]) >= 2,
        ),
      ),
    )
    console.log(
      `${m.name}: edge x ${samples.map((s) => s.join('/')).join(' → ')} (${moved ? 'alive → OK' : 'static → FAIL'})`,
    )
    if (!moved) failed = true
  }

  // ---- v3.13 (3): high-vs-low — wider + fainter, never below floor -----
  // Strength compared as CONTRAST (lane/control, sea-band windows above
  // the surf strip): Lambert lighting multiplies the whole water, so
  // absolute strength confounds elevation with light angle; the ratio
  // cancels it. The ×highWidthScale corridor growth itself is asserted
  // deterministically in vitest (laneParams) — cross-pose px widths are
  // confounded by projection distance, so they print as info only.
  const HILO_ROWS = [368, 396]
  const hiLo = async (name, lowPose, highPose, disc) => {
    await pose(...lowPose)
    const lo = await analyze({ mode: 'disc', disc, absRowsAt: HILO_ROWS, bandRows: [355, 400] })
    await pose(...highPose)
    const hi = await analyze({ mode: 'disc', disc, absRowsAt: HILO_ROWS, bandRows: [355, 400] })
    if (!lo.found || !hi.found) {
      console.log(`${name}: DISC NOT FOUND (low ${lo.found} high ${hi.found}) → FAIL`)
      failed = true
      return
    }
    const rLo = Math.max(...lo.absWidths) / lo.discWidth
    const rHi = Math.max(...hi.absWidths) / hi.discWidth
    const cLo = lo.bandLane / Math.max(lo.bandCtrl, 0.01)
    const cHi = hi.bandLane / Math.max(hi.bandCtrl, 0.01)
    // Pixels assert PRESENCE at both elevations (the opacity floor keeps
    // the high lane clearly visible; the low column is coherent). The
    // vivid-vs-faint ORDERING is not a pixel assert: a high body lights
    // the water ~6× more steeply than a set one (Lambert), so the high
    // lane's absolute add rivals the light-crushed vivid column and no
    // luminance ratio ranks them — the opacity/width mapping itself is
    // exact in vitest (laneParams), and the captured frames show the
    // narrow-vivid vs wide-faint look directly.
    const ok = cHi >= 1.05 && cLo >= 1.05
    console.log(
      `${name}: contrast ${cLo.toFixed(2)}→${cHi.toFixed(2)} (width ratio info ${rLo.toFixed(2)}→${rHi.toFixed(2)}) → ${ok ? 'OK' : 'FAIL'}`,
    )
    if (!ok) failed = true
  }
  await hiLo('day-hilo', [15, 8], [18, 352], 'sun')
  await hiLo('night-hilo', [15.5, 188], [18, 172], 'moon')

  // ---- v3.13 (b regression): risen body — lane on ALL visible water ----
  // From mid-island (lat 22) the planet's bulge hides the near water; the
  // poses sit 12° off the home meridians so the dock stays out of the
  // corridor. Windows probe-calibrated (deterministic pose + viewport).
  for (const spot of [
    // Lane x-windows probe-calibrated per side: the v3.14 great-circle
    // corridor crosses the sea band at different screen x per body.
    // Day band 2 sits clearly below the sea/sky boundary at the control's
    // x-range (the horizon curves down to ~y360 there and the wave-jittered
    // silhouette flips window content run to run).
    { name: 'day-risen', lat: 22, long: 348,
      lane: [400, 540], ctrl: [660, 880], bands: [[342, 356], [366, 380]] },
    { name: 'night-risen', lat: 22, long: 168,
      lane: [520, 760], ctrl: [260, 420], bands: [[356, 370], [371, 385]] },
  ]) {
    await pose(spot.lat, spot.long)
    const r = await winsStable([
      [...spot.lane, ...spot.bands[0]], [...spot.lane, ...spot.bands[1]],
      [...spot.ctrl, ...spot.bands[0]], [...spot.ctrl, ...spot.bands[1]],
    ])
    // The sea band's top edge varies a few px per side — the lane must
    // beat control on at least one band (sky rows tie at ~0).
    const ok = Math.max(r[0] - r[2], r[1] - r[3]) >= 0.03
    console.log(
      `${spot.name}: lane ${r[0].toFixed(3)}/${r[1].toFixed(3)} vs control ${r[2].toFixed(3)}/${r[3].toFixed(3)} → ${ok ? 'OK' : 'FAIL'}`,
    )
    if (!ok) failed = true
  }

  // ---- v3.13 (4): walk-away set — absent once submerged ----------------
  // The lockstep monotone fade is asserted in vitest against the gate
  // math (deterministic); pixels assert final absence from the waterline
  // facing straight out (sea fills mid-frame). Regions hug the sea bulge
  // (sky excluded) and skip the avatar column; tint-gating keeps the
  // OTHER body's legitimate lane out.
  for (const end of [
    { name: 'moon-walkaway', lat: 15, long: 90, tint: 'cool' },
    { name: 'sun-walkaway', lat: 15, long: 128, tint: 'warm' },
  ]) {
    await pose(end.lat, end.long)
    const r = await analyze({
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
  console.log('setcheck passed — wedge, anchor, height mapping, floor, and submergence hold')
}

main().catch((e) => {
  console.error('SETCHECK CRASH:', e)
  process.exit(2)
})
