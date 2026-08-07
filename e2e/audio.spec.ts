import { expect, test } from '@playwright/test'
import { collectErrors, gotoWorld, realErrors } from './helpers'

/**
 * 3C audio acceptance (CLAUDE.md Audio system): fully lazy arming, bus
 * gains driven by proximity/ducking, anim-driven step cadence with
 * surface switching, and instant mute.
 */

interface AudioDebug {
  master: number
  music: number
  world: number
  ui: number
  ctxState: string
  voices: { total: number; byPool: Record<string, number> }
}
const debug = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __audioDebug?: () => unknown }).__audioDebug?.())

test('audio arms only on gesture; mix ducks near the uke; steps track surface; mute hard-zeroes', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await gotoWorld(page)
  await page.waitForTimeout(800)

  // NO AudioContext before a gesture (?e2e pose overrides are not
  // gestures; neither is scene readiness).
  expect(
    await page.evaluate(() => (window as unknown as { __audioArmed?: boolean }).__audioArmed),
  ).toBeUndefined()

  // A synthetic gesture arms it.
  await page.keyboard.press('KeyQ')
  await page.waitForTimeout(400)
  expect(
    await page.evaluate(() => (window as unknown as { __audioArmed?: boolean }).__audioArmed),
  ).toBe(true)

  // Far from the uke: music bus lerps toward its 0.35 base.
  await page.evaluate(() => {
    const s = window.__store!.getState() as unknown as {
      markMoved: () => void
      setCameraMode: (m: string) => void
    }
    s.markMoved()
    s.setCameraMode('orbit')
    window.__controls!.poseOverride = { lat: 60, long: 180 }
  })
  await page.waitForTimeout(2500)
  const far = (await debug(page)) as AudioDebug
  expect(far.music).toBeGreaterThan(0.25)

  // Beside Koa (inside 8 m): the uke owns the soundscape — music → ~0.
  await page.evaluate(() => {
    window.__controls!.poseOverride = { lat: 19, long: 357 }
  })
  await page.waitForTimeout(3000)
  const nearUke = (await debug(page)) as AudioDebug
  expect(nearUke.music).toBeLessThan(0.06)

  // Steps: hold W on grass — anim-driven plants land in walking
  // cadence and report the grass surface.
  await page.evaluate(() => {
    window.__controls!.poseOverride = { lat: 60, long: 90 }
    ;(window as unknown as { __stepLog?: unknown[] }).__stepLog = []
  })
  await page.waitForTimeout(600)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(2000)
  await page.keyboard.up('KeyW')
  const steps = await page.evaluate(
    () => (window as unknown as { __stepLog?: Array<{ t: number; surface: string }> }).__stepLog ?? [],
  )
  // Walk swing 9 rad/s with 2 plants per 2π → ~2.9 steps/s.
  expect(steps.length).toBeGreaterThanOrEqual(3)
  expect(steps.length).toBeLessThanOrEqual(9)
  expect(steps.every((s) => s.surface === 'grass')).toBe(true)

  // Wade: at the movement clamp the steps switch to splashes — which
  // resolve from Aiden's splash pool (file-pool-first; the procedural
  // splash is unreachable while the pool is non-empty).
  await page.evaluate(() => {
    window.__controls!.poseOverride = { lat: 13.4, long: 90 }
    ;(window as unknown as { __stepLog?: unknown[] }).__stepLog = []
  })
  await page.waitForTimeout(600)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(1500)
  await page.keyboard.up('KeyW')
  const wadeSteps = await page.evaluate(
    () => (window as unknown as { __stepLog?: Array<{ surface: string }> }).__stepLog ?? [],
  )
  expect(wadeSteps.length).toBeGreaterThanOrEqual(2)
  expect(wadeSteps.every((s) => s.surface === 'wade')).toBe(true)

  // Mute hard-zeroes the master instantly.
  await page.evaluate(() => {
    ;(window.__store!.getState() as unknown as { setMuted: (m: boolean) => void }).setMuted(true)
  })
  await page.waitForTimeout(100)
  const muted = (await debug(page)) as AudioDebug
  expect(muted.master).toBe(0)

  expect(realErrors(errors)).toEqual([])
})

test('the ukulele actually sounds: strums schedule, the panner leaves the origin, the crossfade hands off both ways', async ({
  page,
}) => {
  await gotoWorld(page)
  await page.waitForTimeout(800)
  await page.keyboard.press('KeyQ')
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const s = window.__store!.getState() as unknown as {
      markMoved: () => void
      setCameraMode: (m: string) => void
    }
    s.markMoved()
    s.setCameraMode('orbit')
    window.__controls!.poseOverride = { lat: 60, long: 180 } // far away
  })
  await page.waitForTimeout(2500)

  // Strums are being consumed even from afar (the scheduler runs
  // post-gesture regardless of distance)…
  const strums1 = await page.evaluate(
    () => (window as unknown as { __ukeStrums?: number }).__ukeStrums ?? 0,
  )
  expect(strums1).toBeGreaterThan(0)
  // …and music sits at its base far from the uke.
  const farDebug = (await debug(page)) as AudioDebug
  expect(farDebug.music).toBeGreaterThan(0.25)

  // Dock entrance (inside the 8 m handoff): the SILENT-UKE regression
  // was three's PositionalAudio never updating a custom-source panner —
  // it sat at the planet's ORIGIN. Assert it now rides the NPC (|p| ≈
  // planet radius, finite), strums keep flowing, and music ducks out.
  await page.evaluate(() => {
    window.__controls!.poseOverride = { lat: 22, long: 0 }
  })
  await page.waitForTimeout(3000)
  const probe = await page.evaluate(() => ({
    strums: (window as unknown as { __ukeStrums?: number }).__ukeStrums ?? 0,
    panner: (window as unknown as { __ukePanner?: number[] }).__ukePanner ?? [0, 0, 0],
  }))
  expect(probe.strums).toBeGreaterThan(strums1)
  const [px, py, pz] = probe.panner
  const mag = Math.hypot(px, py, pz)
  expect(Number.isFinite(mag)).toBe(true)
  expect(mag).toBeGreaterThan(30) // NEVER the origin
  const entrance = (await debug(page)) as AudioDebug
  expect(entrance.music).toBeLessThan(0.08)

  // Walk back out — the lo-fi returns (handoff works both directions).
  await page.evaluate(() => {
    window.__controls!.poseOverride = { lat: 60, long: 180 }
  })
  await page.waitForTimeout(3000)
  const back = (await debug(page)) as AudioDebug
  expect(back.music).toBeGreaterThan(0.25)
})

test('gull cries are AUDIBLE: near-flyover gain ≥ 0.25, every gain on the curve', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await gotoWorld(page)
  await page.waitForTimeout(800)
  await page.keyboard.press('KeyQ')
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const s = window.__store!.getState() as unknown as {
      markMoved: () => void
      setCameraMode: (m: string) => void
    }
    s.markMoved()
    s.setCameraMode('orbit')
    // The sunset beach under the gull orbits (lat 5–10, alt 10–13.5).
    window.__controls!.poseOverride = { lat: 14, long: 0 }
    ;(window as unknown as { __cryLog?: unknown[] }).__cryLog = []
  })
  // Cries fire every 6–16 s from a random gull — collect for a while.
  const deadline = Date.now() + 60_000
  let cries: Array<{ d: number; g: number }> = []
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000)
    cries = await page.evaluate(
      () => (window as unknown as { __cryLog?: Array<{ d: number; g: number }> }).__cryLog ?? [],
    )
    if (cries.length >= 3 && cries.some((c) => c.d <= 18)) break
  }
  expect(cries.length).toBeGreaterThanOrEqual(2)
  // The curve is the ONE authority: every logged gain matches it.
  for (const c of cries) {
    const t = Math.min(1, Math.max(0, (c.d - 10) / 20))
    const expected = 1.08 * (1 - t * t * (3 - 2 * t))
    expect(Math.abs(c.g - expected)).toBeLessThan(0.002)
  }
  // Teeth: a near-flyover cry (≤ 18 m) is clearly audible — and with
  // the nearest-gull preference, standing under the flock guarantees
  // near cries arrive.
  const near = cries.filter((c) => c.d <= 18)
  expect(near.length).toBeGreaterThanOrEqual(1)
  for (const c of near) expect(c.g).toBeGreaterThanOrEqual(0.48)
})

test('crab snaps: watched paused crab snaps in-bounds; none from afar', async ({ page }) => {
  await gotoWorld(page)
  await page.waitForTimeout(800)
  await page.keyboard.press('KeyQ')
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const s = window.__store!.getState() as unknown as {
      markMoved: () => void
      setCameraMode: (m: string) => void
    }
    s.markMoved()
    s.setCameraMode('orbit')
    // Far from every crab spawn: no snaps may log.
    window.__controls!.poseOverride = { lat: 60, long: 90 }
    ;(window as unknown as { __snapLog?: number[] }).__snapLog = []
  })
  await page.waitForTimeout(4000)
  const farSnaps = await page.evaluate(
    () => ((window as unknown as { __snapLog?: number[] }).__snapLog ?? []).length,
  )
  expect(farSnaps).toBe(0)

  // Park beside a crab spawn (within 4 m): snaps arrive, spaced ≥3 s.
  await page.evaluate(() => {
    window.__controls!.poseOverride = { lat: 20, long: 22 }
    ;(window as unknown as { __snapLog?: number[] }).__snapLog = []
  })
  await page.waitForTimeout(12000)
  const snaps = await page.evaluate(
    () => (window as unknown as { __snapLog?: number[] }).__snapLog ?? [],
  )
  expect(snaps.length).toBeGreaterThanOrEqual(1)
  for (let i = 1; i < snaps.length; i++) {
    expect(snaps[i] - snaps[i - 1]).toBeGreaterThanOrEqual(2.9)
  }
})

test('tab return never blasts: rAF stall is guarded; hidden suspends, resume restarts clean', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const errors = collectErrors(page)
  await gotoWorld(page)
  await page.waitForTimeout(800)
  await page.keyboard.press('KeyQ')
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    const s = window.__store!.getState() as unknown as {
      markMoved: () => void
      setCameraMode: (m: string) => void
    }
    s.markMoved()
    s.setCameraMode('orbit')
    window.__controls!.poseOverride = { lat: 30, long: 0 }
  })
  await page.waitForTimeout(2500)
  const sched = () =>
    page.evaluate(() => (window as unknown as { __ukeSched?: number }).__ukeSched ?? 0)
  expect(await sched()).toBeGreaterThan(0) // scheduler alive — never vacuous

  // ---- Part A: rAF stall WITHOUT a visibility event (alt-tab
  // throttling, breakpoints). The AudioContext clock keeps running for
  // 8 s while no frame renders — the original bug's exact shape. The
  // scheduler guard must skip forward, never replay ~3 bars at once.
  await page.evaluate(() => {
    const w = window as unknown as {
      requestAnimationFrame: typeof requestAnimationFrame
      __rafOrig?: typeof requestAnimationFrame
      __rafQ?: FrameRequestCallback[]
    }
    w.__rafOrig = w.requestAnimationFrame.bind(window)
    w.__rafQ = []
    w.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      w.__rafQ!.push(cb)
      return 0
    }) as typeof requestAnimationFrame
  })
  await page.waitForTimeout(1000)
  const frozen1 = await sched()
  await page.waitForTimeout(7000)
  const frozen2 = await sched()
  expect(frozen2, 'the rAF freeze must actually stall the loop').toBe(frozen1)
  const beforeResume = frozen2
  await page.evaluate(() => {
    const w = window as unknown as {
      requestAnimationFrame: typeof requestAnimationFrame
      __rafOrig?: typeof requestAnimationFrame
      __rafQ?: FrameRequestCallback[]
    }
    w.requestAnimationFrame = w.__rafOrig!
    for (const cb of w.__rafQ!.splice(0)) w.requestAnimationFrame(cb)
  })
  await page.waitForTimeout(1200)
  const afterResume = await sched()
  // Broken code schedules the whole 8 s backlog (~18 strums) on the
  // resume frame; the guard restarts the bar clock: ≤ 2 bars total in
  // the resume second.
  expect(afterResume - beforeResume).toBeLessThanOrEqual(12)
  const census = ((await debug(page)) as AudioDebug).voices
  expect(census.total).toBeLessThanOrEqual(16)
  expect(census.byPool['uke-strum'] ?? 0).toBeLessThanOrEqual(6)

  // ---- Part B: the visibility path — hidden must suspend the context
  // (freezing its clock) and hard-zero the master; visible must resume,
  // reset baselines, and restore the master without a burst.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect
    .poll(async () => ((await debug(page)) as AudioDebug).ctxState, { timeout: 5000 })
    .toBe('suspended')
  expect(((await debug(page)) as AudioDebug).master).toBe(0)
  // With the clock frozen the scheduler fills its 0.8 s lookahead once,
  // then idles — no growth across the hidden stretch.
  const hidden1 = await sched()
  await page.waitForTimeout(3000)
  expect(await sched()).toBe(hidden1)

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect
    .poll(async () => ((await debug(page)) as AudioDebug).ctxState, { timeout: 5000 })
    .toBe('running')
  await expect
    .poll(async () => ((await debug(page)) as AudioDebug).master, { timeout: 2000 })
    .toBe(1)
  // The resume second schedules at the normal cadence, not a backlog.
  const resumeBase = await sched()
  await page.waitForTimeout(1200)
  expect((await sched()) - resumeBase).toBeLessThanOrEqual(12)
  // …and the music keeps flowing afterward (normal ambience returns).
  await page.waitForTimeout(3000)
  expect((await sched()) - resumeBase).toBeGreaterThanOrEqual(6)

  expect(realErrors(errors)).toEqual([])
})

test('campfire crackle is PURE proximity — identical day vs night at 12/8/5/3 m', async ({
  page,
}) => {
  await gotoWorld(page)
  await page.waitForTimeout(800)
  await page.keyboard.press('KeyQ') // arm audio
  await page.waitForTimeout(300)
  expect(
    await page.evaluate(() => (window as unknown as { __audioArmed?: boolean }).__audioArmed),
  ).toBe(true)
  await page.evaluate(() => {
    const s = window.__store!.getState() as unknown as {
      markMoved: () => void
      setCameraMode: (m: string) => void
    }
    s.markMoved()
    s.setCameraMode('orbit')
  })

  // The fire sits at lat 22 / long 180; walking up the meridian gives
  // exact arc distances: Δlat° × (π/180) × R.
  const latFor = (arcM: number) => 22 + (arcM / 55) * (180 / Math.PI)
  const sample = async (arcM: number, nightMix: number) => {
    await page.evaluate(
      ({ lat, nm }) => {
        window.__controls!.poseOverride = { lat, long: 180 }
        ;(window as unknown as { __nightMixOverride?: number }).__nightMixOverride = nm
      },
      { lat: latFor(arcM), nm: nightMix },
    )
    await page.waitForTimeout(2200) // let the 0.5 s lerp settle
    return page.evaluate(() => (window as unknown as { __fireLevel?: number }).__fireLevel ?? -1)
  }

  for (const arc of [12, 8, 5, 3]) {
    const day = await sample(arc, 0)
    const night = await sample(arc, 1)
    expect(day).toBeGreaterThanOrEqual(0) // probe alive — never vacuous
    expect(Math.abs(day - night)).toBeLessThan(0.015)
    if (arc <= 3.2) expect(night).toBeGreaterThan(0.6) // full up close
    if (arc >= 11.8) expect(night).toBeLessThan(0.08) // silent far out
  }
  await page.evaluate(() => {
    delete (window as unknown as { __nightMixOverride?: number }).__nightMixOverride
  })
})
