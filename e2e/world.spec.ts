import { expect, test } from '@playwright/test'
import { collectErrors, gotoWorld, realErrors, sprintUntil } from './helpers'

test('desktop: spawn view, pointer lock, sprint to the dock, modal round-trip', async ({ page }) => {
  const errors = collectErrors(page)
  await gotoWorld(page)

  // Loading finishes and the intro hint shows.
  const hint = page.getByText('WASD / drag to move', { exact: false })
  await expect(hint).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1000)

  // Pointer lock round-trip at spawn, away from any clickable mesh.
  await page.mouse.click(640, 560)
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => document.pointerLockElement !== null)).toBe(true)
  await expect(page.getByText('Click to look around', { exact: false })).toBeHidden()
  await page.mouse.move(900, 300)
  await page.waitForTimeout(200)
  // Esc release is browser UI that synthetic keys can't trigger headless;
  // exitPointerLock() exercises the same unlock path.
  await page.evaluate(() => document.exitPointerLock())
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => document.pointerLockElement === null)).toBe(true)
  await expect(page.getByText('Click to resume', { exact: false })).toBeVisible()

  // Sprint down the meridian-0 dock until the Photos prompt fires.
  // R=55: walk (6.5 m/s) would need ~11.5 s; sprint (10 m/s) ~7.5 s — the
  // time bound discriminates and doubles as the sprint regression check.
  const prompt = page.locator('kbd', { hasText: 'E' })
  const ms = await sprintUntil(page, Math.PI, () => prompt.isVisible())
  await expect(prompt).toBeVisible()
  expect(ms, 'sprint should reach the dock end in well under walk time').toBeLessThan(10_000)
  await expect(hint).toBeHidden()

  // E opens the gallery modal; Escape closes it.
  await page.keyboard.press('KeyE')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 3000 })
  await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  // Jump is cosmetic but should not error.
  await page.keyboard.press('Space')
  await page.waitForTimeout(400)

  expect(realErrors(errors)).toEqual([])
})

test('desktop: sit system — E sits and stands, movement suppressed while seated', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await gotoWorld(page)
  await page.waitForTimeout(1000)

  // The 0.4 s sit/stand world tween stretches under slow headless first
  // frames (dt clamps at 0.05), so never assert on fixed delays: wait for
  // the world to stop moving instead.
  const settlePolar = async () => {
    await page.evaluate(() => {
      delete (window as unknown as { __polarPrev?: number }).__polarPrev
    })
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __polarPrev?: number } & Window
        const p = w.__controls!.surfPolarDeg
        const prev = w.__polarPrev
        w.__polarPrev = p
        return prev !== undefined && Math.abs(p - prev) < 0.001
      },
      undefined,
      { polling: 250, timeout: 10_000 },
    )
  }

  // Teleport just seaward of the center log, facing it (north at long 180).
  await page.evaluate(() => {
    window.__controls!.poseOverride = { lat: 22.8, long: 180 }
    window.__controls!.azimuthOverride = Math.PI
  })
  await page.waitForTimeout(700)
  expect(await page.evaluate(() => window.__store!.getState().nearbyLog)).toBe(0)
  await expect(page.getByText('Sit')).toBeVisible()

  // E sits: aim straight at the log picks the center slot; the world tween
  // parks the seat under the pole and suppresses movement.
  await page.keyboard.press('KeyE')
  await settlePolar()
  expect(await page.evaluate(() => window.__store!.getState().seatedSeatId)).toBe('0:1')
  expect(await page.evaluate(() => window.__controls!.seated)).toBe(true)
  const seatedPolar = await page.evaluate(() => window.__controls!.surfPolarDeg)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(600)
  await page.keyboard.up('KeyW')
  expect(
    Math.abs((await page.evaluate(() => window.__controls!.surfPolarDeg)) - seatedPolar),
    'holding W while seated must not rotate the world',
  ).toBeLessThan(0.01)

  // E again stands up just in front of the seat (fire side) and movement
  // comes back.
  await page.keyboard.press('KeyE')
  await settlePolar()
  expect(await page.evaluate(() => window.__store!.getState().seatedSeatId)).toBeNull()
  expect(await page.evaluate(() => window.__controls!.seated)).toBe(false)
  const stood = await page.evaluate(() => [
    window.__controls!.surfPolarDeg,
    window.__controls!.surfLongDeg,
  ])
  // Walk EAST along the sand — the stand spot is inside the log blocker's
  // radius (that's the point of it), so walking north into the log is
  // correctly a wall; east is open ground (and shows up in longitude).
  await page.evaluate(() => {
    window.__controls!.azimuthOverride = Math.PI / 2
  })
  await page.waitForTimeout(150)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(500)
  await page.keyboard.up('KeyW')
  const moved = await page.evaluate(() => [
    window.__controls!.surfPolarDeg,
    window.__controls!.surfLongDeg,
  ])
  expect(
    Math.abs(moved[0] - stood[0]) + Math.abs(moved[1] - stood[1]),
    'movement must resume after standing',
  ).toBeGreaterThan(0.2)

  // Jump also stands up.
  await page.evaluate(() => {
    window.__controls!.poseOverride = { lat: 22.8, long: 180 }
    window.__controls!.azimuthOverride = Math.PI
  })
  await page.waitForTimeout(500)
  await page.keyboard.press('KeyE')
  await settlePolar()
  expect(await page.evaluate(() => window.__controls!.seated)).toBe(true)
  // Hold Space long enough to span a frame — the controller POLLS the key
  // map, so a synthetic instant press can fall between slow headless
  // frames (a real tap always spans several).
  await page.keyboard.down('Space')
  await page.waitForTimeout(250)
  await page.keyboard.up('Space')
  await settlePolar()
  expect(await page.evaluate(() => window.__controls!.seated)).toBe(false)

  expect(realErrors(errors)).toEqual([])
})
