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

test('mobile: photo gallery pages by tap and swipe; viewer opens and closes', async ({ page }) => {
  const errors = collectErrors(page)
  await gotoWorld(page)
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__store!.getState().openModal('photos'))
  const shell = page.getByRole('dialog', { name: 'Photos' })
  await expect(shell).toBeVisible({ timeout: 2000 })
  await expect(page.getByText('1–6 of 17')).toBeVisible()

  // Tap the page arrow.
  const next = (await page.getByRole('button', { name: 'Next page' }).boundingBox())!
  await page.touchscreen.tap(next.x + next.width / 2, next.y + next.height / 2)
  await expect(page.getByText('7–12 of 17')).toBeVisible()

  // Swipe the grid back a page (pointer-event drag).
  const grid = (await page.locator('[data-photo-idx]').first().boundingBox())!
  await page.mouse.move(grid.x + 30, grid.y + 30)
  await page.mouse.down()
  await page.mouse.move(grid.x + 160, grid.y + 34, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByText('1–6 of 17')).toBeVisible()

  // Open a tile; swipe inside the viewer advances the photo and must
  // NOT exit it (the synthesized post-drag click is consumed).
  const tile = (await page.locator('[data-photo-idx="0"]').boundingBox())!
  await page.touchscreen.tap(tile.x + tile.width / 2, tile.y + tile.height / 2)
  const viewer = page.getByRole('dialog', { name: /^Photo:/ })
  await expect(viewer).toBeVisible()
  await expect(viewer.getByText('1 of 17')).toBeVisible()
  const vp = page.viewportSize()!
  await page.mouse.move(vp.width * 0.7, vp.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(vp.width * 0.25, vp.height * 0.52, { steps: 8 })
  await page.mouse.up()
  await expect(viewer).toBeVisible()
  await expect(viewer.getByText('2 of 17')).toBeVisible()
  const back = (await page.getByRole('button', { name: 'Back to grid' }).boundingBox())!
  await page.touchscreen.tap(back.x + back.width / 2, back.y + back.height / 2)
  await expect(viewer).toBeHidden()
  await page.evaluate(() => window.__store!.getState().closeModal())
  await expect(shell).toBeHidden()
  expect(realErrors(errors)).toEqual([])
})

test('mobile: contact form fields and Send stay reachable', async ({ page }) => {
  const errors = collectErrors(page)
  await page.route('**/formspree.io/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  )
  await gotoWorld(page)
  await page.waitForTimeout(400)
  await page.evaluate(() => window.__store!.getState().openModal('contact'))
  const dialog = page.getByRole('dialog', { name: 'Contact' })
  await expect(dialog).toBeVisible({ timeout: 2000 })
  await page.getByLabel('Name').fill('Phone Visitor')
  await page.getByLabel('Email').fill('phone@example.com')
  await page.getByLabel('Message', { exact: true }).fill('Sent from a small screen')
  // The Send button scrolls into the modal's viewport and works.
  const send = page.getByRole('button', { name: 'Send' })
  await send.scrollIntoViewIfNeeded()
  await expect(send).toBeInViewport()
  await send.click()
  await expect(page.getByText("Message sent — I'll get back to you.")).toBeVisible()
  await page.evaluate(() => window.__store!.getState().closeModal())
  await expect(dialog).toBeHidden()
  expect(realErrors(errors)).toEqual([])
})

test('mobile: papers modal opens; view and download links present', async ({ page }) => {
  const errors = collectErrors(page)
  await gotoWorld(page)
  await page.waitForTimeout(400)
  await page.evaluate(() => window.__store!.getState().openModal('papers'))
  const dialog = page.getByRole('dialog', { name: 'Papers' })
  await expect(dialog).toBeVisible({ timeout: 2000 })
  await expect(page.getByRole('link', { name: 'View' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Download' })).toBeVisible()
  await page.evaluate(() => window.__store!.getState().closeModal())
  await expect(dialog).toBeHidden()
  expect(realErrors(errors)).toEqual([])
})

test('mobile: portrait nudge asks for landscape, offers a way past, and never blocks /classic', async ({
  page,
}) => {
  const errors = collectErrors(page)
  // NOTE: no gotoWorld here — that helper pre-dismisses the nudge for
  // the gameplay suites, and this test is about the nudge itself.
  await page.goto('/?e2e', { waitUntil: 'load' })
  await page.waitForSelector('canvas', { timeout: 30_000 })
  const nudge = page.locator('[data-rotate-nudge]')
  await expect(nudge).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Turn your phone sideways' })).toBeVisible()

  // Rotation-lock help appears once turning the phone clearly hasn't
  // happened — the iOS case, where the browser cannot rotate for us.
  await expect(page.getByText('Turned it and nothing happened?')).toBeVisible({ timeout: 9000 })

  // There is always a way past: portrait stays playable.
  await page.getByRole('button', { name: 'Play in portrait anyway' }).click()
  await expect(nudge).toBeHidden()
  // And the world is live underneath it.
  await page.waitForFunction(() => window.__controls !== undefined, undefined, { timeout: 15_000 })

  // Rotating to landscape hides it without any dismissal at all.
  await page.evaluate(() => sessionStorage.removeItem('sl-rotate-nudge'))
  await page.setViewportSize({ width: 915, height: 412 })
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('canvas', { timeout: 30_000 })
  await expect(nudge).toBeHidden()

  // The classic site is a document: never nudged, either way up.
  await page.setViewportSize({ width: 412, height: 915 })
  await page.goto('/classic', { waitUntil: 'networkidle' })
  await expect(nudge).toBeHidden()

  expect(realErrors(errors)).toEqual([])
})
