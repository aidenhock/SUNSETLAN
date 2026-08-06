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

  // Mute hard-zeroes the master instantly.
  await page.evaluate(() => {
    ;(window.__store!.getState() as unknown as { setMuted: (m: boolean) => void }).setMuted(true)
  })
  await page.waitForTimeout(100)
  const muted = (await debug(page)) as AudioDebug
  expect(muted.master).toBe(0)

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
