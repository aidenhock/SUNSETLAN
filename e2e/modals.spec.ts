import { expect, test } from '@playwright/test'
import { collectErrors, gotoWorld, realErrors } from './helpers'

const CASES: [string, string][] = [
  ['music', 'Music'],
  ['photos', 'Photos'],
  ['projects', 'Projects'],
  ['papers', 'Papers'],
  ['about', "Hey, I'm Aiden"],
  ['videos', 'Videos'],
  ['memorial-1', 'A good boy'],
  ['contact', 'Contact'],
]

test('every modal type opens from data; gallery lightbox and lite-embed work', async ({ page }) => {
  const errors = collectErrors(page)
  await gotoWorld(page)
  const dialog = page.getByRole('dialog')

  for (const [id, heading] of CASES) {
    await page.evaluate((mid) => window.__store!.getState().openModal(mid), id)
    await expect(dialog).toBeVisible({ timeout: 2000 })
    await expect(page.getByRole('heading', { name: heading, exact: false })).toBeVisible()

    if (id === 'photos') {
      // Lightbox: open first photo, arrow-key nav, Esc back to grid only.
      await page.locator('ul button').first().click()
      const nextBtn = page.getByRole('button', { name: 'Next photo' })
      await expect(nextBtn).toBeVisible()
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(150)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
      await expect(nextBtn).toBeHidden()
      await expect(dialog).toBeVisible()
    }

    if (id === 'papers') {
      // View opens the browser PDF viewer; Download carries the attr.
      const view = page.getByRole('link', { name: 'View' })
      await expect(view).toHaveAttribute('href', /aiden-hock-resume\.pdf$/)
      await expect(view).toHaveAttribute('target', '_blank')
      await expect(page.getByRole('link', { name: 'Download' })).toHaveAttribute('download', '')
    }

    if (id === 'memorial-1') {
      // Placeholder stones say so — no pretending to be real remembrances.
      await expect(page.getByText('A placeholder stone', { exact: false })).toBeVisible()
    }

    if (id === 'videos') {
      // Lite-embed: thumbnail first, iframe only after Play.
      const play = page.getByRole('button', { name: /Play Big Buck Bunny/ })
      await expect(play).toBeVisible()
      await play.click()
      await expect(page.locator('iframe[title*="Big Buck Bunny"]')).toBeVisible({
        timeout: 3000,
      })
    }

    await page.evaluate(() => window.__store!.getState().closeModal())
    await expect(dialog).toBeHidden()
  }

  expect(realErrors(errors)).toEqual([])
})

test('photo gallery: 3 pages, boundary-crossing viewer, Esc to the right page, controls restored', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await gotoWorld(page)
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__store!.getState().openModal('photos'))
  const shell = page.getByRole('dialog', { name: 'Photos' })
  await expect(shell).toBeVisible({ timeout: 2000 })

  // Page through all three pages with the arrows; the counter tracks.
  await expect(page.getByText('1–6 of 17')).toBeVisible()
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.getByText('7–12 of 17')).toBeVisible()
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.getByText('13–17 of 17')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled()

  // Keyboard pages too (grid mode ← →).
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByText('7–12 of 17')).toBeVisible()

  // Open the last photo of page 2 (index 11) and arrow ACROSS the page
  // boundary — navigation is continuous over all photos, wrapping at
  // the ends.
  await page.locator('[data-photo-idx="11"]').click()
  const viewer = page.getByRole('dialog', { name: /^Photo:/ })
  await expect(viewer).toBeVisible()
  await expect(viewer.getByText('12 of 17')).toBeVisible()
  await page.keyboard.press('ArrowRight') // crosses the page-2/3 boundary
  await expect(viewer.getByText('13 of 17')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft') // back across it
  await expect(viewer.getByText('11 of 17')).toBeVisible()
  for (let i = 0; i < 11; i++) await page.keyboard.press('ArrowLeft')
  await expect(viewer.getByText('17 of 17')).toBeVisible() // wrapped past the start

  // Esc exits the VIEWER only, and the grid followed to page 3.
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
  await expect(shell).toBeVisible()
  await expect(page.getByText('13–17 of 17')).toBeVisible()

  // Esc again closes the modal; the world's controls come back.
  await page.keyboard.press('Escape')
  await expect(shell).toBeHidden()
  const polar = await page.evaluate(() => window.__controls!.surfPolarDeg)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(400)
  await page.keyboard.up('KeyW')
  expect(
    Math.abs((await page.evaluate(() => window.__controls!.surfPolarDeg)) - polar),
    'movement must resume after the gallery closes',
  ).toBeGreaterThan(0.1)

  expect(realErrors(errors)).toEqual([])
})

test('contact form: stubbed Formspree — success, failure, honeypot, validation', async ({
  page,
}) => {
  const errors = collectErrors(page)
  // Count every request that would reach Formspree; answer per-test.
  let hits = 0
  let respond: 'ok' | 'fail' = 'ok'
  await page.route('**/formspree.io/**', async (route) => {
    hits++
    await route.fulfill({
      status: respond === 'ok' ? 200 : 500,
      contentType: 'application/json',
      body: respond === 'ok' ? '{"ok":true}' : '{"error":"boom"}',
    })
  })
  await gotoWorld(page)
  await page.waitForTimeout(400)

  // Opening the modal must fire nothing.
  await page.evaluate(() => window.__store!.getState().openModal('contact'))
  const dialog = page.getByRole('dialog', { name: 'Contact' })
  await expect(dialog).toBeVisible({ timeout: 2000 })
  await page.waitForTimeout(300)
  expect(hits).toBe(0)

  // Validation gates the button: bad email keeps it disabled and blurs
  // announce role=alert errors.
  const send = page.getByRole('button', { name: 'Send' })
  await expect(send).toBeDisabled()
  await page.getByLabel('Name').fill('Test Visitor')
  await page.getByLabel('Email').fill('not-an-email')
  await page.getByLabel('Message', { exact: true }).fill('Hello from the island!')
  await page.getByLabel('Email').blur()
  await expect(page.getByRole('alert')).toContainText('does not look right')
  await expect(send).toBeDisabled()
  await page.getByLabel('Email').fill('visitor@example.com')
  await expect(send).toBeEnabled()

  // Success path.
  await send.click()
  await expect(page.getByText("Message sent — I'll get back to you.")).toBeVisible()
  expect(hits).toBe(1)

  // Failure path (fresh mount resets state).
  await page.evaluate(() => window.__store!.getState().closeModal())
  await expect(dialog).toBeHidden()
  respond = 'fail'
  await page.evaluate(() => window.__store!.getState().openModal('contact'))
  await page.getByLabel('Name').fill('Test Visitor')
  await page.getByLabel('Email').fill('visitor@example.com')
  await page.getByLabel('Message', { exact: true }).fill('Second try')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText("That didn't send", { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: 'aidinihock@gmail.com' })).toBeVisible()
  expect(hits).toBe(2)

  // Honeypot: filled hidden field -> NO request, fake success.
  await page.evaluate(() => window.__store!.getState().closeModal())
  await page.evaluate(() => window.__store!.getState().openModal('contact'))
  await page.getByLabel('Name').fill('Bot Botson')
  await page.getByLabel('Email').fill('bot@example.com')
  await page.getByLabel('Message', { exact: true }).fill('Buy my thing')
  await page.evaluate(() => {
    const el = document.querySelector<HTMLInputElement>('input[name="_gotcha"]')!
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(el, 'https://spam.example')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText("Message sent — I'll get back to you.")).toBeVisible()
  expect(hits).toBe(2) // unchanged — the bot's submission never left the page

  await page.evaluate(() => window.__store!.getState().closeModal())
  // The browser logs a resource error for OUR stubbed 500 — that one is
  // the test's own failure injection, not an app error.
  expect(realErrors(errors).filter((e) => !e.includes('status of 500'))).toEqual([])
})
