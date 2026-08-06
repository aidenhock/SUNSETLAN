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
