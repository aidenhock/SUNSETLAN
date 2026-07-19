import { expect, test } from '@playwright/test'
import { collectErrors, gotoWorld, realErrors } from './helpers'

test('mobile: joystick sprint, tap button, modal round-trip, orbit drag', async ({ page }) => {
  const errors = collectErrors(page)
  await gotoWorld(page)

  const hint = page.getByText('Drag the joystick', { exact: false })
  await expect(hint).toBeVisible({ timeout: 30_000 })
  const joystick = page.getByTestId('touch-joystick')
  await expect(joystick).toBeVisible()
  await page.waitForTimeout(800)

  // Full joystick deflection sprints (≥ 0.95): drag the knob all the way up
  // and hold until the Photos tap button appears at the dock end.
  const jb = (await joystick.boundingBox())!
  const jcx = jb.x + jb.width / 2
  const jcy = jb.y + jb.height / 2
  await page.mouse.move(jcx, jcy)
  await page.mouse.down()
  await page.mouse.move(jcx, jcy - 60, { steps: 6 }) // past the rim → clamped to full
  const interactButton = page.getByRole('button', { name: 'Photos' })
  const start = Date.now()
  let held = 0
  while (!(await interactButton.isVisible()) && held < 20_000) {
    await page.waitForTimeout(300)
    held = Date.now() - start // wall clock — sleeps alone undercount by 10-20%
  }
  await page.mouse.up()
  await expect(interactButton).toBeVisible()
  expect(held, 'full deflection should sprint (walk-only would be ~11.5 s)').toBeLessThan(10_000)
  await expect(hint).toBeHidden()

  // Tap the floating button (not the mesh) → modal; Close by tap.
  const bb = (await interactButton.boundingBox())!
  await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 3000 })
  const cb = (await page.getByRole('button', { name: 'Close' }).boundingBox())!
  await page.touchscreen.tap(cb.x + cb.width / 2, cb.y + cb.height / 2)
  await expect(dialog).toBeHidden()

  // Right-side drag orbits the camera without breaking anything.
  const vp = page.viewportSize()!
  await page.mouse.move(vp.width * 0.75, vp.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(vp.width * 0.35, vp.height * 0.45, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(300)

  expect(realErrors(errors)).toEqual([])
})
