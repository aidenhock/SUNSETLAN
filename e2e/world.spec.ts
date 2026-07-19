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
