import { expect, test } from '@playwright/test'
import { collectErrors, gotoWorld, realErrors } from './helpers'

const CASES: [string, string][] = [
  ['music', 'Music'],
  ['photos', 'Photos'],
  ['projects', 'Projects'],
  ['about', "Hey, I'm Aiden"],
  ['videos', 'Videos'],
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
  await expect(page.getByText('1–6 of 13')).toBeVisible()
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.getByText('7–12 of 13')).toBeVisible()
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.getByText('13 of 13')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled()

  // Keyboard pages too (grid mode ← →).
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByText('7–12 of 13')).toBeVisible()

  // Open the last photo of page 2 (index 11) and arrow ACROSS the page
  // boundary — navigation is continuous over all photos, wrapping at
  // the ends.
  await page.locator('[data-photo-idx="11"]').click()
  const viewer = page.getByRole('dialog', { name: /^Photo:/ })
  await expect(viewer).toBeVisible()
  await expect(viewer.getByText('12 of 13')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(viewer.getByText('13 of 13')).toBeVisible()
  await page.keyboard.press('ArrowRight') // wraps to the first photo
  await expect(viewer.getByText('1 of 13')).toBeVisible()
  await page.keyboard.press('ArrowLeft') // back to the last
  await expect(viewer.getByText('13 of 13')).toBeVisible()

  // Esc exits the VIEWER only, and the grid followed to page 3.
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
  await expect(shell).toBeVisible()
  await expect(page.getByText('13 of 13')).toBeVisible()

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
